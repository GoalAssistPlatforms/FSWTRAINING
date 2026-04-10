import { supabase } from './supabase'

export const getTeamMembers = async () => {
    // 1. Fetch all normal users
    const { data: members, error: membersError } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'user')

    if (membersError) {
        console.error('Error fetching users:', membersError)
        throw membersError
    }

    return { team: null, members: members }
}

/**
 * Fetch the course progress for all members of the manager's team.
 * The RLS policy on user_progress restricts this to only progress records
 * belonging to users in the manager's team.
 */
export const getTeamProgress = async () => {
    const { data, error } = await supabase
        .from('user_progress')
        .select(`
            id,
            user_id,
            course_id,
            status,
            completed_at,
            due_date,
            expires_at,
            certificate_id,
            courses:course_id ( id, title, thumbnail_url )
        `)

    if (error) {
        console.error('Error fetching team progress:', error)
        throw error
    }

    return data
}

/**
 * Helper to aggregate member stats
 */
export const getTeamStats = async () => {
    const { team, members } = await getTeamMembers()
    const progressData = await getTeamProgress()

    // Aggregate stats per user
    const userStats = members.map(member => {
        const userProgress = progressData.filter(p => p.user_id === member.id)
        const completed = userProgress.filter(p => p.status === 'completed').length
        const inProgress = userProgress.filter(p => p.status === 'in-progress').length
        
        return {
            ...member,
            totalAssigned: userProgress.length,
            completed,
            inProgress,
            progressData: userProgress
        }
    })

    return { team, stats: userStats }
}



/**
 * Assign a course to a specific user.
 */
export const assignCourseToUser = async (userId, courseId, dueDate = null, isMandatory = false) => {
    const { data: { user } } = await supabase.auth.getUser()

    const payload = {
        user_id: userId,
        course_id: courseId,
        status: 'assigned',
        assigned_by: user.id,
        is_mandatory: isMandatory
    }
    
    if (dueDate) {
        payload.due_date = new Date(dueDate).toISOString()
    }

    // Upsert so if they already have progress, we just update it
    const { data, error } = await supabase
        .from('user_progress')
        .upsert(payload, { onConflict: 'user_id,course_id' })
        .select()
        .single()

    if (error) throw error
    return data
}

/**
 * Bulk assign a course to the entire team or a selected subset.
 */
export const bulkAssignCourse = async (courseId, dueDate = null, isMandatory = false, targetUserIds = null) => {
    const { members } = await getTeamMembers()
    if (!members || members.length === 0) return []

    // Determine which users to assign to
    const targetMembers = targetUserIds
        ? members.filter(m => targetUserIds.includes(m.id))
        : members;

    if (targetMembers.length === 0) return []

    // Using loop for straightforward phase 2 implementation
    const results = []
    for (const member of targetMembers) {
        try {
            const result = await assignCourseToUser(member.id, courseId, dueDate, isMandatory)
            results.push(result)
        } catch (e) {
            console.error(`Failed to assign course to ${member.email}:`, e)
        }
    }
    return results
}

/**
 * Revoke a course assignment.
 */
export const revokeAssignment = async (userId, courseId) => {
    const { error } = await supabase
        .from('user_progress')
        .delete()
        .match({ user_id: userId, course_id: courseId })

    if (error) throw error
    return true
}

/**
 * Force a user to resit an expired/completed course.
 * Sets status to 'assigned' and wipes completion dates/certificates.
 */
export const forceResitCourse = async (userId, courseId) => {
    const { data: { user } } = await supabase.auth.getUser()

    const { data, error } = await supabase
        .from('user_progress')
        .update({
            status: 'assigned',
            assigned_by: user.id,
            completed_at: null,
            expires_at: null,
            certificate_id: null
        })
        .match({ user_id: userId, course_id: courseId })
        .select()
        .single()

    if (error) throw error
    return data
}

/**
 * Update the department of a user.
 */
export const updateUserDepartment = async (userId, department) => {
    const { error } = await supabase.rpc('update_user_department', {
        p_user_id: userId,
        p_department: department
    });

    if (error) {
        console.error('Error updating user department:', error)
        throw error
    }

    return { success: true }
}
