import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf-8');
const url = env.split('VITE_SUPABASE_URL=')[1].split('\n')[0].trim();
const key = env.split('VITE_SUPABASE_ANON_KEY=')[1].split('\n')[0].trim();

const supabase = createClient(url, key);

async function run() {
    const p1 = await supabase.from('profiles').select('*').limit(1);
    console.log('Profiles Error:', p1.error);
    const p2 = await supabase.from('user_progress').select('*, courses:course_id(id)').limit(1);
    console.log('Progress Error:', p2.error);
}
run();
