import { supabase } from './supabase.js';

// --- Notifications ---

export async function fetchMyNotifications() {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('notifications')
        .select(`
            *,
            sender:sender_id(email),
            course:related_course_id(title)
        `)
        .eq('recipient_id', user.user.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) throw error;
    return data;
}

export async function markNotificationAsRead(notificationId) {
    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);
    if (error) throw error;
}

export async function markAllNotificationsAsRead() {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) return;
    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('recipient_id', user.user.id)
        .eq('is_read', false);
    if (error) throw error;
}

export async function sendNudge(recipientId, courseId, message) {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) throw new Error('Not authenticated');

    const { error } = await supabase
        .from('notifications')
        .insert({
            recipient_id: recipientId,
            sender_id: user.user.id,
            type: 'nudge',
            message: message,
            related_course_id: courseId || null
        });
    if (error) throw error;
}

export async function sendSystemAlert(recipientId, message, courseId) {
    const { error } = await supabase
        .from('notifications')
        .insert({
            recipient_id: recipientId,
            sender_id: null,
            type: 'system_alert',
            message: message,
            related_course_id: courseId || null
        });
    if (error) {
        console.error("System alert failed:", error);
    }
}

// --- Extension Requests ---

export async function requestExtension(courseAssignmentId, requestedDate, reason) {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) throw new Error('Not authenticated');

    // Make sure we only have one pending request per assignment
    const { data: existing } = await supabase
        .from('extension_requests')
        .select('id')
        .eq('course_assignment_id', courseAssignmentId)
        .eq('status', 'pending')
        .maybeSingle();
        
    if (existing) {
        throw new Error('You already have a pending extension request for this course.');
    }

    const { error } = await supabase
        .from('extension_requests')
        .insert({
            user_id: user.user.id,
            course_assignment_id: courseAssignmentId,
            requested_date: requestedDate,
            reason_text: reason,
            status: 'pending'
        });
        
    if (error) throw error;
}

export async function fetchPendingExtensions() {
    // Managers can fetch all pending
    const { data, error } = await supabase
        .from('extension_requests')
        .select(`
            *,
            user:user_id(email, id),
            course_assignment:course_assignment_id(due_date, course:course_id(title))
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
}

export async function resolveExtension(requestId, status, newDate, managerReply) {
    // status: 'approved' or 'denied'
    const { data: user } = await supabase.auth.getUser();
    
    // First figure out the assignment ID and user
    const { data: reqData, error: reqErr } = await supabase
        .from('extension_requests')
        .select('course_assignment_id, user_id, requested_date, course_assignment:course_assignment_id(course:course_id(title))')
        .eq('id', requestId)
        .single();
        
    if (reqErr) throw reqErr;

    // Update the request
    const { error } = await supabase
        .from('extension_requests')
        .update({
            status: status,
            manager_id: user?.user?.id || null,
            manager_reply: managerReply
        })
        .eq('id', requestId);
        
    if (error) throw error;

    // If approved, update the actual assignment date
    if (status === 'approved' && newDate) {
        const { error: assignErr } = await supabase
            .from('user_progress')
            .update({ due_date: newDate })
            .eq('id', reqData.course_assignment_id);
        if (assignErr) throw assignErr;
    }

    // Send a notification to the user about the result
    const resultMsg = status === 'approved' ? `Your extension request was approved. New deadline: ${new Date(newDate).toLocaleDateString()}` : `Your extension request was denied. ${managerReply ? 'Reason: ' + managerReply : ''}`;
    
    await supabase.from('notifications').insert({
        recipient_id: reqData.user_id,
        sender_id: user?.user?.id,
        type: 'extension_result',
        message: resultMsg,
        related_course_id: null
    });
}
