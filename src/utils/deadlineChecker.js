import { supabase } from '../api/supabase.js';
import { sendSystemAlert } from '../api/notifications.js';

export async function checkAndGenerateDeadlineNotifications() {
    try {
        const { data: user } = await supabase.auth.getUser();
        if (!user?.user) return;

        // Fetch user's assigned courses that are not completed and have a due date
        const { data: progressList, error } = await supabase
            .from('user_progress')
            .select(`
                id, course_id, due_date, status, 
                courses:course_id(title)
            `)
            .eq('user_id', user.user.id)
            .neq('status', 'completed')
            .not('due_date', 'is', null);

        if (error || !progressList) return;

        const now = new Date();
        const MS_PER_DAY = 1000 * 60 * 60 * 24;

        // For each course, calculate days remaining
        for (const progress of progressList) {
            const dueDate = new Date(progress.due_date);
            const daysRemaining = Math.ceil((dueDate - now) / MS_PER_DAY);

            // We want to trigger at 7, 3, and 1 days.
            let alertThreshold = null;
            if (daysRemaining === 7) alertThreshold = 7;
            else if (daysRemaining === 3) alertThreshold = 3;
            else if (daysRemaining === 1) alertThreshold = 1;
            else if (daysRemaining < 0) alertThreshold = 0; // Overdue

            if (alertThreshold !== null) {
                // Check if we already sent this specific alert
                const messagePrefix = alertThreshold === 0 
                    ? `OVERDUE: The deadline for ${progress.courses.title} has passed.` 
                    : `Reminder: You have ${alertThreshold} day(s) left to complete ${progress.courses.title}.`;
                
                const likePattern = alertThreshold === 0 
                    ? 'OVERDUE:%' 
                    : `Reminder: You have ${alertThreshold}%`;
                    
                const { data: existingAlerts } = await supabase
                    .from('notifications')
                    .select('id, created_at')
                    .eq('recipient_id', user.user.id)
                    .eq('related_course_id', progress.course_id)
                    .eq('type', 'system_alert')
                    .like('message', likePattern);

                const alertExists = existingAlerts?.some(a => {
                    const ageInDays = (now - new Date(a.created_at)) / MS_PER_DAY;
                    return ageInDays < 2; // If an alert for this day count was generated in the last 48 hours, skip
                });

                if (!alertExists) {
                    await sendSystemAlert(user.user.id, messagePrefix, progress.course_id);
                }
            }
        }
    } catch (err) {
        console.error("Failed deadline checker:", err);
    }
}
