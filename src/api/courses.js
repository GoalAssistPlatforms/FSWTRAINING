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

    const { data: courses, error } = await supabase
        .from('courses')
        .select('content_json')
        .gte('created_at', dates.periodStart.toISOString())
        .neq('status', 'archived');
        
    if (error) throw error;

    const actualCoursesCount = (courses || []).filter(c => {
        let content = c.content_json;
        if (typeof content === 'string') {
            try { content = JSON.parse(content); } catch (e) {}
        }
        return content?.is_system_simulation !== true && content?.type !== 'video_walkthrough';
    }).length;
    
    return {
        used: actualCoursesCount,
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
                    const { data: courses, error: countError } = await supabase
                        .from('courses')
                        .select('content_json')
                        .gte('created_at', dates.periodStart.toISOString())
                        .neq('status', 'archived');
                        
                    if (countError) throw countError;

                    const actualCoursesCount = (courses || []).filter(c => {
                        let content = c.content_json;
                        if (typeof content === 'string') {
                            try { content = JSON.parse(content); } catch (e) {}
                        }
                        return content?.is_system_simulation !== true && content?.type !== 'video_walkthrough';
                    }).length;
                    
                    if (settings.max_courses_per_period > 0 && actualCoursesCount >= settings.max_courses_per_period) {
                        throw new Error(`Limit Reached: You have created ${actualCoursesCount} courses in the current billing period, which is your maximum limit. Please contact your administrator to upgrade your plan.`);
                    }
                }
            }
        }
    }


    if (courseData.review_interval_months && !courseData.next_review_date) {
        const d = new Date();
        d.setMonth(d.getMonth() + parseInt(courseData.review_interval_months));
        courseData.next_review_date = d.toISOString();
    }

    const { data, error } = await supabase
        .from('courses')
        .insert([courseData])
        .select()

    if (error) throw error
    return data[0]
}

export const updateCourse = async (id, updates) => {
    if (updates.review_interval_months !== undefined && updates.next_review_date === undefined) {
        if (updates.review_interval_months) {
            const d = new Date();
            d.setMonth(d.getMonth() + parseInt(updates.review_interval_months));
            updates.next_review_date = d.toISOString();
        } else {
            updates.next_review_date = null;
        }
    }

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

export const saveLessonProgress = async (userId, courseId, moduleIndex, lessonIndex, highestModule, highestLesson) => {
    try {
        const { data: existing } = await supabase
            .from('user_progress')
            .select('id, status')
            .eq('user_id', userId)
            .eq('course_id', courseId)
            .maybeSingle();

        if (existing) {
            let status = existing.status;
            if (status === 'assigned') status = 'in-progress';
            
            await supabase.from('user_progress').update({
                status,
                last_module_index: moduleIndex,
                last_lesson_index: lessonIndex,
                highest_module_index: highestModule,
                highest_lesson_index: highestLesson
            }).eq('id', existing.id);
        } else {
            await supabase.from('user_progress').insert({
                user_id: userId,
                course_id: courseId,
                status: 'in-progress',
                last_module_index: moduleIndex,
                last_lesson_index: lessonIndex,
                highest_module_index: highestModule,
                highest_lesson_index: highestLesson
            });
        }
    } catch (e) {
        console.error('Error saving lesson progress:', e);
    }
}

export const saveExemptedLessons = async (userId, courseId, exemptedLessons, status = 'in-progress', certId = null, expiresAt = null) => {
    try {
        const { data: existing } = await supabase
            .from('user_progress')
            .select('id')
            .eq('user_id', userId)
            .eq('course_id', courseId)
            .maybeSingle();

        const updates = {
            status,
            exempted_lessons: exemptedLessons
        };

        if (status === 'completed') {
            updates.completed_at = new Date().toISOString();
            updates.certificate_id = certId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2));
            if (expiresAt) {
                updates.expires_at = expiresAt;
            }
        }

        if (existing) {
            await supabase.from('user_progress').update(updates).eq('id', existing.id);
        } else {
            await supabase.from('user_progress').insert({
                user_id: userId,
                course_id: courseId,
                ...updates
            });
        }
    } catch (e) {
        console.error('Error saving exempted lessons:', e);
    }
}

