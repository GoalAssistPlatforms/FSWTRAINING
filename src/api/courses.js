import { supabase } from './supabase'

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

export const createCourse = async (courseData) => {
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

    return { success: true }
}
