require('dotenv').config({path: '.env'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function test() {
    const p1 = await supabase.from('profiles').select('*').limit(1);
    console.log('Profiles Error:', p1.error);
    const p2 = await supabase.from('user_progress').select('*, courses:course_id(id)').limit(1);
    console.log('Progress Error:', p2.error);
}
test();
