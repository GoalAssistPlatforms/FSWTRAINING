import { supabase } from './supabase.js';

/**
 * Submits feedback from any logged-in user or manager
 * @param {string} type - 'positive', 'negative', or 'urgent'
 * @param {string} content - The feedback text
 * @param {File} [file] - Optional screenshot file
 */
export async function submitFeedback(type, content, file) {
    try {
        const { data: userAuth } = await supabase.auth.getUser();
        if (!userAuth.user) throw new Error("Not authenticated");

        let screenshotUrl = null;

        if (file) {
            // Upload screenshot to storage bucket
            const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
            
            // Try uploading
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('feedback_screenshots')
                .upload(fileName, file);

            if (uploadError) {
                console.warn("Failed to upload screenshot to feedback_screenshots. Attempting fallback bucket...", uploadError);
                // Fallback to course_assets bucket if feedback_screenshots bucket isn't prepared yet
                const { data: fbData, error: fbError } = await supabase.storage
                    .from('course_assets')
                    .upload(`feedback_${fileName}`, file);
                
                if (fbError) throw fbError;

                const { data: fbUrl } = supabase.storage
                    .from('course_assets')
                    .getPublicUrl(`feedback_${fileName}`);
                screenshotUrl = fbUrl.publicUrl;
            } else {
                const { data: publicUrlData } = supabase.storage
                    .from('feedback_screenshots')
                    .getPublicUrl(fileName);
                screenshotUrl = publicUrlData.publicUrl;
            }
        }

        // Insert feedback entry
        const { data, error } = await supabase
            .from('feedbacks')
            .insert({
                user_id: userAuth.user.id,
                type,
                content,
                screenshot_url: screenshotUrl,
                status: 'pending'
            })
            .select()
            .single();

        if (error) throw error;

        // Query all administrator and manager accounts to dispatch notifications
        try {
            const { data: staffMembers } = await supabase
                .from('profiles')
                .select('id, email')
                .in('role', ['admin', 'manager']);

            if (staffMembers && staffMembers.length > 0) {
                const notificationsPayload = staffMembers.map(staff => ({
                    recipient_id: staff.id,
                    sender_id: userAuth.user.id,
                    type: 'feedback_alert',
                    message: `New feedback received: "${content.substring(0, 45)}${content.length > 45 ? '...' : ''}" (${type.toUpperCase()})`,
                    related_course_id: null
                }));
                
                await supabase.from('notifications').insert(notificationsPayload);

                // Dispatch Email Notification
                const staffEmails = staffMembers.map(s => s.email).filter(Boolean);
                if (staffEmails.length > 0) {
                    fetch('/api/email', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            to: staffEmails,
                            subject: `New Feedback Submitted (${type.toUpperCase()})`,
                            html: `<h2>New Feedback Submitted</h2>
                                   <p><strong>Type:</strong> ${type}</p>
                                   <p><strong>Message:</strong></p>
                                   <blockquote style="background:#f9f9f9;border-left:5px solid #ccc;padding:10px;">${content}</blockquote>
                                   <p>Please log in to the dashboard to review and resolve this feedback.</p>`
                        })
                    }).catch(err => console.error("Email dispatch failed:", err));
                }
            }
        } catch (notifError) {
            console.error("Failed to generate administrator notifications:", notifError);
            // Non-blocking; allow submission to complete even if alert fails
        }

        return data;

    } catch (e) {
        console.error("Feedback submission error:", e);
        throw e;
    }
}

/**
 * Fetches all feedback submissions (Admin Dashboard)
 */
export async function getAllFeedback() {
    try {
        const { data, error } = await supabase
            .from('feedbacks')
            .select(`
                *,
                profiles (
                    email,
                    full_name,
                    department,
                    role
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    } catch (e) {
        console.error("Failed to fetch all feedback:", e);
        throw e;
    }
}

/**
 * Updates status and admin response (Admin Action)
 * @param {string} feedbackId
 * @param {string} status - 'pending', 'under-review', 'acting-on', 'resolved', 'archived'
 * @param {string} [adminResponse] - Text response from administrator
 */
export async function updateFeedbackStatusAndResponse(feedbackId, status, adminResponse) {
    try {
        // Fetch current feedback item to check if responded_at is already set, and fetch user_id & content for notifying
        const { data: current, error: fetchError } = await supabase
            .from('feedbacks')
            .select('responded_at, admin_response, user_id, content')
            .eq('id', feedbackId)
            .maybeSingle();

        const updatePayload = {
            status,
            admin_response: adminResponse || null,
            updated_at: new Date()
        };

        // If giving a new response and none existed yet, set responded_at
        if (adminResponse && adminResponse.trim() !== '' && (!current || !current.responded_at)) {
            updatePayload.responded_at = new Date();
        }

        const { data, error } = await supabase
            .from('feedbacks')
            .update(updatePayload)
            .eq('id', feedbackId)
            .select()
            .single();

        if (error) {
            // Check if error is due to missing responded_at column in schema cache
            const errStr = error.message ? error.message.toLowerCase() : '';
            if (errStr.includes('responded_at') || errStr.includes('column') || error.code === '42703') {
                console.warn("Schema cache missing responded_at or column not found. Retrying without responded_at...", error);
                
                delete updatePayload.responded_at;
                
                const { data: retryData, error: retryError } = await supabase
                    .from('feedbacks')
                    .update(updatePayload)
                    .eq('id', feedbackId)
                    .select()
                    .single();

                if (retryError) throw retryError;

                // Send notification to the user
                if (adminResponse && adminResponse.trim() !== '' && current && current.user_id) {
                    try {
                        const { data: adminAuth } = await supabase.auth.getUser();
                        await supabase.from('notifications').insert({
                            recipient_id: current.user_id,
                            sender_id: adminAuth?.user?.id || null,
                            type: 'feedback_alert',
                            message: `The Altius Insight Team has responded to your feedback: "${adminResponse.substring(0, 45)}${adminResponse.length > 45 ? '...' : ''}"`,
                            related_course_id: null
                        });

                        // Also notify managers if status is 'resolved'
                        if (status === 'resolved') {
                            const { data: managers } = await supabase.from('profiles').select('id').eq('role', 'manager');
                            if (managers && managers.length > 0) {
                                const managerPayload = managers.map(m => ({
                                    recipient_id: m.id,
                                    sender_id: adminAuth?.user?.id || null,
                                    type: 'feedback_alert',
                                    message: `Admin has resolved feedback from a user. Resolution: "${adminResponse.substring(0, 45)}${adminResponse.length > 45 ? '...' : ''}"`,
                                    related_course_id: null
                                }));
                                await supabase.from('notifications').insert(managerPayload);
                            }
                        }
                    } catch (nErr) {
                        console.error("Failed to dispatch feedback response notification (retry path):", nErr);
                    }
                }

                return retryData;
            }
            throw error;
        }

        // Send notification to the user
        if (adminResponse && adminResponse.trim() !== '' && current && current.user_id) {
            try {
                const { data: adminAuth } = await supabase.auth.getUser();
                await supabase.from('notifications').insert({
                    recipient_id: current.user_id,
                    sender_id: adminAuth?.user?.id || null,
                    type: 'feedback_alert',
                    message: `The Altius Insight Team has responded to your feedback: "${adminResponse.substring(0, 45)}${adminResponse.length > 45 ? '...' : ''}"`,
                    related_course_id: null
                });

                // Also notify managers if status is 'resolved'
                if (status === 'resolved') {
                    const { data: managers } = await supabase.from('profiles').select('id').eq('role', 'manager');
                    if (managers && managers.length > 0) {
                        const managerPayload = managers.map(m => ({
                            recipient_id: m.id,
                            sender_id: adminAuth?.user?.id || null,
                            type: 'feedback_alert',
                            message: `Admin has resolved feedback from a user. Resolution: "${adminResponse.substring(0, 45)}${adminResponse.length > 45 ? '...' : ''}"`,
                            related_course_id: null
                        }));
                        await supabase.from('notifications').insert(managerPayload);
                    }
                }
            } catch (nErr) {
                console.error("Failed to dispatch feedback response notification:", nErr);
            }
        }

        return data;
    } catch (e) {
        console.error("Failed to update feedback:", e);
        throw e;
    }
}

/**
 * Deletes a feedback submission (Admin Action)
 * @param {string} feedbackId
 */
export async function deleteFeedback(feedbackId) {
    try {
        const { error } = await supabase
            .from('feedbacks')
            .delete()
            .eq('id', feedbackId);

        if (error) throw error;
        return true;
    } catch (e) {
        console.error("Failed to delete feedback:", e);
        throw e;
    }
}
