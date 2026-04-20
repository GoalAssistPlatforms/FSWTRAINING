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
        redirectTo: 'https://fswtraining.vercel.app/reset-password', // Open live app even if initiated locally
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

export const signUp = async (email, password, fullName, department) => {
    // 1. Sign up the user with metadata and redirect URL
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: fullName,
                department: department
            },
            emailRedirectTo: 'https://fswtraining.vercel.app' // Force live app direction instead of localhost
        }
    })
    if (error) throw error

    // 2. Create a profile entry
    if (data.user) {
        const profileData = { id: data.user.id, email: data.user.email, role: 'user' }
        if (fullName) profileData.full_name = fullName
        if (department) profileData.department = department

        // Note: For this to work before user clicks the confirmation email, 
        // there must either be a DB trigger or the RLS policy for profiles 
        // must allow inserts based on raw JWT claims, as the session might be null.
        const { error: profileError } = await supabase
            .from('profiles')
            .upsert([profileData])

        if (profileError) {
            console.warn('Profile creation failed (might already exist via trigger or blocked by RLS):', profileError)
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

