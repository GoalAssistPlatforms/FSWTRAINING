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

export const verifyCurrentPassword = async (email, password) => {
    // Verify by attempting to sign in
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })
    if (error) throw new Error('Incorrect current password.');
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

export const updateUserProfile = async (userId, { fullName, department, jobTitle, phone, avatarUrl }) => {
    // 1. Update auth.users metadata
    const metaDataUpdate = {}
    if (fullName !== undefined) metaDataUpdate.full_name = fullName
    if (department !== undefined) metaDataUpdate.department = department
    if (jobTitle !== undefined) metaDataUpdate.job_title = jobTitle
    if (phone !== undefined) metaDataUpdate.phone = phone
    if (avatarUrl !== undefined) metaDataUpdate.avatar_url = avatarUrl

    if (Object.keys(metaDataUpdate).length > 0) {
        const { error: authError } = await supabase.auth.updateUser({
            data: metaDataUpdate
        })
        if (authError) throw authError
    }

    // 2. Update profiles table
    const profileUpdate = {}
    if (fullName !== undefined) profileUpdate.full_name = fullName
    if (department !== undefined) profileUpdate.department = department
    if (jobTitle !== undefined) profileUpdate.job_title = jobTitle
    if (phone !== undefined) profileUpdate.phone = phone
    if (avatarUrl !== undefined) profileUpdate.avatar_url = avatarUrl

    if (Object.keys(profileUpdate).length > 0) {
        const { error: profileError } = await supabase
            .from('profiles')
            .update(profileUpdate)
            .eq('id', userId)
            
        if (profileError) throw profileError
    }
}

export const signUp = async (email, password, fullName, department) => {
    // 0. Check capacity limit
    const { data: limitReached, error: limitError } = await supabase.rpc('check_user_quota')
    
    if (limitError) {
        console.error('Error checking user quota:', limitError)
        throw new Error('Could not verify platform capacity. Please try again later.')
    }
    
    if (limitReached) {
        throw new Error('Registration is currently closed: the platform has reached its maximum user capacity.')
    }

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
        return { ...user, role: 'user', full_name: user.user_metadata?.full_name } // Default to user if profile missing
    }

    return { ...user, ...profile }
}

