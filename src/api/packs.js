import { supabase } from './supabase'

/**
 * Fetches all packs created by managers/admins.
 */
export const getPacks = async () => {
    const { data, error } = await supabase
        .from('packs')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
}

/**
 * Fetches a single pack details along with its items.
 */
export const getPack = async (id) => {
    const { data: pack, error: packError } = await supabase
        .from('packs')
        .select('*')
        .eq('id', id)
        .single();
    if (packError) throw packError;

    const { data: items, error: itemsError } = await supabase
        .from('pack_items')
        .select('*')
        .eq('pack_id', id)
        .order('sort_order', { ascending: true });
    if (itemsError) throw itemsError;

    return { ...pack, items };
}

/**
 * Creates a new pack and its items.
 */
export const createPack = async ({ title, description, items }) => {
    const { data: userAuth } = await supabase.auth.getUser();
    if (!userAuth?.user) throw new Error("User not authenticated");

    const { data: pack, error: packError } = await supabase
        .from('packs')
        .insert([{ title, description, created_by: userAuth.user.id }])
        .select()
        .single();
    if (packError) throw packError;

    if (items && items.length > 0) {
        const itemsToInsert = items.map((item, index) => ({
            pack_id: pack.id,
            item_type: item.item_type,
            item_id: item.item_id,
            sort_order: index
        }));
        const { error: itemsError } = await supabase
            .from('pack_items')
            .insert(itemsToInsert);
        if (itemsError) throw itemsError;
    }

    return pack;
}

/**
 * Updates pack details and syncs pack items.
 */
export const updatePack = async (id, { title, description, items }) => {
    const { data: pack, error: packError } = await supabase
        .from('packs')
        .update({ title, description, updated_at: new Date() })
        .eq('id', id)
        .select()
        .single();
    if (packError) throw packError;

    // Delete existing items
    const { error: deleteError } = await supabase
        .from('pack_items')
        .delete()
        .eq('pack_id', id);
    if (deleteError) throw deleteError;

    // Insert new items
    if (items && items.length > 0) {
        const itemsToInsert = items.map((item, index) => ({
            pack_id: id,
            item_type: item.item_type,
            item_id: item.item_id,
            sort_order: index
        }));
        const { error: itemsError } = await supabase
            .from('pack_items')
            .insert(itemsToInsert);
        if (itemsError) throw itemsError;
    }

    return pack;
}

/**
 * Deletes a pack.
 */
export const deletePack = async (id) => {
    const { error } = await supabase
        .from('packs')
        .delete()
        .eq('id', id);
    if (error) throw error;
    return { success: true };
}

/**
 * Assigns a pack to a user and inserts individual course progress rows in user_progress for course/guide items.
 */
export const assignPack = async ({ packId, userId, dueDate }) => {
    const { data: userAuth } = await supabase.auth.getUser();
    const managerId = userAuth?.user?.id;

    const payload = { 
        pack_id: packId, 
        user_id: userId, 
        assigned_by: managerId 
    };

    if (dueDate) {
        payload.due_date = new Date(dueDate).toISOString();
    }

    // Insert assignment
    const { data: assignment, error: assignError } = await supabase
        .from('pack_assignments')
        .insert([payload])
        .select()
        .single();
    if (assignError) throw assignError;

    // Fetch pack items
    const { data: items, error: itemsError } = await supabase
        .from('pack_items')
        .select('*')
        .eq('pack_id', packId);
    if (itemsError) throw itemsError;

    // Filter course/guide items
    const courseItems = items.filter(item => item.item_type === 'course' || item.item_type === 'guide');

    // Assign courses in user_progress if not already assigned
    for (const courseItem of courseItems) {
        const { data: existingProgress } = await supabase
            .from('user_progress')
            .select('id')
            .eq('user_id', userId)
            .eq('course_id', courseItem.item_id)
            .maybeSingle();

        if (!existingProgress) {
            const coursePayload = {
                user_id: userId,
                course_id: courseItem.item_id,
                status: 'assigned',
                assigned_by: managerId
            };
            if (dueDate) {
                coursePayload.due_date = new Date(dueDate).toISOString();
            }
            await supabase
                .from('user_progress')
                .insert([coursePayload]);
        }
    }

    return assignment;
}

/**
 * Bulk assigns a pack to a list of users.
 */
export const bulkAssignPack = async ({ packId, userIds, dueDate }) => {
    const results = [];
    for (const userId of userIds) {
        try {
            const result = await assignPack({ packId, userId, dueDate });
            results.push(result);
        } catch (e) {
            console.error(`Failed to assign pack to user ${userId}:`, e);
        }
    }
    return results;
}

/**
 * Revokes a pack assignment.
 */
export const revokePackAssignment = async (assignmentId) => {
    const { error } = await supabase
        .from('pack_assignments')
        .delete()
        .eq('id', assignmentId);
    if (error) throw error;
    return { success: true };
}

/**
 * Fetches assigned packs for a user, hydating the items and completion details.
 */
export const getPackAssignments = async (userId) => {
    let query = supabase
        .from('pack_assignments')
        .select(`
            *,
            pack:packs(*)
        `);
    if (userId) {
        query = query.eq('user_id', userId);
    }
    const { data: assignments, error: assignError } = await query;
    if (assignError) throw assignError;

    const detailedAssignments = [];
    for (const assignment of assignments) {
        if (!assignment.pack) continue; // Skip if pack was deleted
        
        const { data: items, error: itemsError } = await supabase
            .from('pack_items')
            .select('*')
            .eq('pack_id', assignment.pack_id)
            .order('sort_order', { ascending: true });
        if (itemsError) throw itemsError;

        const hydratedItems = [];
        for (const item of items) {
            let title = '';
            let description = '';
            let file_url = '';
            let completed = false;

            if (item.item_type === 'course' || item.item_type === 'guide') {
                const { data: course } = await supabase
                    .from('courses')
                    .select('title, description')
                    .eq('id', item.item_id)
                    .maybeSingle();
                if (course) {
                    title = course.title;
                    description = course.description || '';
                }

                // Check completion status in user_progress
                const { data: progress } = await supabase
                    .from('user_progress')
                    .select('status')
                    .eq('user_id', assignment.user_id)
                    .eq('course_id', item.item_id)
                    .maybeSingle();
                if (progress && progress.status === 'completed') {
                    completed = true;
                }
            } else if (item.item_type === 'document' || item.item_type === 'link') {
                const { data: doc } = await supabase
                    .from('guide_documents')
                    .select('title, description, file_url')
                    .eq('id', item.item_id)
                    .maybeSingle();
                if (doc) {
                    title = doc.title;
                    description = doc.description || '';
                    file_url = doc.file_url || '';
                }

                // Check completion status in user_pack_item_progress
                const { data: itemProgress } = await supabase
                    .from('user_pack_item_progress')
                    .select('id')
                    .eq('assignment_id', assignment.id)
                    .eq('item_type', item.item_type)
                    .eq('item_id', item.item_id)
                    .maybeSingle();
                if (itemProgress) {
                    completed = true;
                }
            }

            hydratedItems.push({
                ...item,
                title,
                description,
                file_url,
                completed
            });
        }

        // Calculate progress metrics
        const totalItems = hydratedItems.length;
        const completedItems = hydratedItems.filter(i => i.completed).length;
        const completionPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

        let status = assignment.status;
        if (totalItems > 0 && completedItems === totalItems && assignment.status !== 'completed') {
            status = 'completed';
            await supabase
                .from('pack_assignments')
                .update({ status: 'completed', completed_at: new Date().toISOString() })
                .eq('id', assignment.id);
        } else if (completedItems > 0 && completedItems < totalItems && assignment.status === 'assigned') {
            status = 'in-progress';
            await supabase
                .from('pack_assignments')
                .update({ status: 'in-progress' })
                .eq('id', assignment.id);
        }

        detailedAssignments.push({
            ...assignment,
            status,
            items: hydratedItems,
            totalItems,
            completedItems,
            completionPct
        });
    }

    return detailedAssignments;
}

export const markPackItemCompleted = async (assignmentId, itemType, itemId) => {
    const { error } = await supabase
        .from('user_pack_item_progress')
        .insert([{ 
            assignment_id: assignmentId, 
            item_type: itemType, 
            item_id: itemId 
        }], { onConflict: 'assignment_id,item_type,item_id', ignoreDuplicates: true });
    
    if (error) throw error;

    // Trigger update calculation by re-fetching (which runs completion checks)
    const { data: assignment } = await supabase
        .from('pack_assignments')
        .select('user_id')
        .eq('id', assignmentId)
        .single();
    if (assignment) {
        await getPackAssignments(assignment.user_id);
    }

    return { success: true };
}

/**
 * Fetches statistics on pack completion for manager reporting.
 */
export const getPackCompletionStats = async (packId) => {
    const { data: assignments, error } = await supabase
        .from('pack_assignments')
        .select('*')
        .eq('pack_id', packId);
    if (error) throw error;

    const stats = [];
    for (const assignment of assignments) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', assignment.user_id)
            .maybeSingle();

        const { data: items } = await supabase
            .from('pack_items')
            .select('*')
            .eq('pack_id', packId);
        
        let completedItems = 0;
        const totalItems = items?.length || 0;

        for (const item of items || []) {
            if (item.item_type === 'course' || item.item_type === 'guide') {
                const { data: progress } = await supabase
                    .from('user_progress')
                    .select('status')
                    .eq('user_id', assignment.user_id)
                    .eq('course_id', item.item_id)
                    .maybeSingle();
                if (progress?.status === 'completed') completedItems++;
            } else {
                const { data: itemProgress } = await supabase
                    .from('user_pack_item_progress')
                    .select('id')
                    .eq('assignment_id', assignment.id)
                    .eq('item_type', item.item_type)
                    .eq('item_id', item.item_id)
                    .maybeSingle();
                if (itemProgress) completedItems++;
            }
        }

        stats.push({
            ...assignment,
            user: profile,
            totalItems,
            completedItems,
            completionPct: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0
        });
    }
    return stats;
}
