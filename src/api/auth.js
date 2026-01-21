import { supabase } from './supabase'

export const signIn = async (email, password) => {
    // Standard Supabase Login
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })
    if (error) throw error
    return data
}

export const resetPassword = async (email) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password', // Optional: customize redirect URL
    })
    if (error) throw error
    return data
}

export const updatePassword = async (newPassword) => {
    const { data, error } = await supabase.auth.updateUser({
        password: newPassword
    })
    if (error) throw error
    return data
}

export const signUp = async (email, password) => {
    // 1. Sign up the user
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    })
    if (error) throw error

    // 2. Create a profile entry (optional if you have triggers, but good for safety)
    if (data.user) {
        const { error: profileError } = await supabase
            .from('profiles')
            .insert([{ id: data.user.id, email: data.user.email, role: 'user' }])

        if (profileError) {
            console.warn('Profile creation failed (might already exist via trigger):', profileError)
        }
    }

    return data
}


export const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
}

export const getCurrentUser = async () => {
    // Check for real Supabase session
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    // Fetch profile to get role
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

    if (error) {
        console.error('Error fetching profile:', error)
        return { ...user, role: 'user' } // Default to user if profile missing
    }

    return { ...user, role: profile.role }
}
