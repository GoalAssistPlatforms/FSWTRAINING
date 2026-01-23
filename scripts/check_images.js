
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');

const env = {};
if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            env[key.trim()] = value.trim();
        }
    });
}

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkImages() {
    console.log('Fetching courses...');
    const { data: courses, error } = await supabase
        .from('courses')
        .select('id, title, thumbnail_url, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error fetching courses:', error);
        return;
    }

    console.log('\nLast 5 Courses:');
    courses.forEach(c => {
        console.log(`\nTitle: "${c.title}"`);
        console.log(`ID: ${c.id}`);
        console.log(`Created: ${new Date(c.created_at).toLocaleString()}`);
        console.log(`Thumbnail URL: ${c.thumbnail_url}`);

        if (!c.thumbnail_url) {
            console.log('STATUS: [MISSING] (Null or Empty)');
        } else if (c.thumbnail_url.includes('cloudinary')) {
            console.log('STATUS: [OK] (Cloudinary)');
        } else if (c.thumbnail_url.includes('blob.core.windows.net') || c.thumbnail_url.includes('oaidalle')) {
            console.log('STATUS: [EXPIRED] (OpenAI Temp URL)');
        } else {
            console.log('STATUS: [UNKNOWN] (Likely broken)');
        }
    });
}

checkImages();
