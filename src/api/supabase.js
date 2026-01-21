import { createClient } from '@supabase/supabase-js'

// TODO: Replace with actual keys from environment variables or user input
const supabaseUrl = (import.meta.env && import.meta.env.VITE_SUPABASE_URL) || (typeof process !== 'undefined' && process.env.VITE_SUPABASE_URL);
const supabaseKey = (import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) || (typeof process !== 'undefined' && process.env.VITE_SUPABASE_ANON_KEY);

export const supabase = createClient(supabaseUrl, supabaseKey)
