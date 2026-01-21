import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

let supabaseUrl, supabaseKey;

try {
    const envPath = path.resolve(process.cwd(), '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    lines.forEach(line => {
        const [key, value] = line.split('=');
        if (key === 'VITE_SUPABASE_URL') supabaseUrl = value.trim();
        if (key === 'VITE_SUPABASE_ANON_KEY') supabaseKey = value.trim();
    });
} catch (e) {
    console.error('Failed to read .env file:', e.message);
}

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStorage() {
    console.log('Checking Supabase Storage for "course_assets" bucket...');

    // 1. List buckets
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();

    if (bucketError) {
        console.error('Error listing buckets:', bucketError.message);
        return;
    }

    const bucket = buckets.find(b => b.id === 'course_assets');
    if (bucket) {
        console.log('Bucket "course_assets" exists.');
        console.log('Public:', bucket.public);
    } else {
        console.warn('Bucket "course_assets" DOES NOT exist. Attempting to create it...');
        const { data, error: createError } = await supabase.storage.createBucket('course_assets', {
            public: true,
            fileSizeLimit: 10485760, // 10MB
            allowedMimeTypes: ['image/png', 'image/jpeg']
        });

        if (createError) {
            console.error('Failed to create bucket:', createError.message);
            console.log('NOTE: You may need to create the bucket manually in the Supabase Dashboard if permissions are restricted.');
        } else {
            console.log('Bucket "course_assets" successfully created!');
        }
    }

    // 2. Try to list files in the bucket
    const { data: files, error: fileError } = await supabase.storage
        .from('course_assets')
        .list('', { limit: 5 });

    if (fileError) {
        console.error('Error listing files in "course_assets":', fileError.message);
    } else {
        console.log(`Found ${files.length} files in bucket.`);
        files.forEach(f => console.log(' -', f.name));
    }
}

checkStorage();
