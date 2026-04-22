import { supabase } from './supabase'
import { getPlatformSettings, getBillingPeriodDates } from './admin'

export const getCourses = async (role) => {
    let query = supabase
        .from('courses')
        .select('*')
        .order('created_at', { ascending: false })

    if (role !== 'manager') {
        query = query.eq('status', 'live')
    } else {
        // Managers see everything except archived
        query = query.neq('status', 'archived')
    }

    const { data, error } = await query
    if (error) throw error
    return data
}

export const getUserProgress = async (userId) => {
    const { data, error } = await supabase
        .from('user_progress')
        .select('*')
        .eq('user_id', userId)

    if (error) throw error
    return data
}

export const getCourseUsageStats = async () => {
    const settings = await getPlatformSettings();
    if (!settings) return null;
    const dates = getBillingPeriodDates(settings.subscription_start_date, settings.renewal_period_months);
    if (!dates) return null;

    const { count, error } = await supabase
        .from('courses')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', dates.periodStart.toISOString())
        .neq('status', 'archived');
        
    if (error) throw error;
    
    return {
        used: count || 0,
        total: settings.max_courses_per_period,
        renewalDate: dates.nextRenewal
    };
}

export const createCourse = async (courseData) => {
    // Check limits if user is a manager
    const { data: userAuth } = await supabase.auth.getUser();
    if (userAuth?.user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', userAuth.user.id).single();
        if (profile?.role === 'manager') {
            const settings = await getPlatformSettings();
            if (settings) {
                const dates = getBillingPeriodDates(settings.subscription_start_date, settings.renewal_period_months);
                if (dates) {
                    const { count, error: countError } = await supabase
                        .from('courses')
                        .select('*', { count: 'exact', head: true })
                        .gte('created_at', dates.periodStart.toISOString())
                        .neq('status', 'archived');
                        
                    if (countError) throw countError;
                    
                    if (count >= settings.max_courses_per_period) {
                        throw new Error(`Limit Reached: You have created ${count} courses in the current billing period, which is your maximum limit. Please contact your administrator to upgrade your plan.`);
                    }
                }
            }
        }
    }

    const { data, error } = await supabase
        .from('courses')
        .insert([courseData])
        .select()

    if (error) throw error
    return data[0]
}

export const updateCourse = async (id, updates) => {
    const { data, error } = await supabase
        .from('courses')
        .update(updates)
        .eq('id', id)
        .select()

    if (error) throw error
    return data[0]
}

export const deleteCourse = async (id, role) => {
    console.log(`Attempting to archive (soft delete) course ${id} with role: ${role}`)

    const { error } = await supabase
        .from('courses')
        .update({ status: 'archived' })
        .eq('id', id)

    if (error) {
        console.error('Supabase Soft Delete Error:', error)
        throw new Error(`Delete failed: ${error.message}`)
    }

    // Automatically unassign the course from all users
    const { error: unassignError } = await supabase
        .from('user_progress')
        .delete()
        .eq('course_id', id)

    if (unassignError) {
        console.error('Failed to unassign users during course deletion:', unassignError)
    }

    return { success: true }
}
