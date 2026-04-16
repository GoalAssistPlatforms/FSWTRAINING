import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { goldCourse } from '../src/data/gold_standard_course.js';

const envPath = path.resolve(process.cwd(), '.env');
const envConfig = fs.readFileSync(envPath, 'utf8');
const env = {};
envConfig.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
        env[key.trim()] = value.trim();
    }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function create() {
    console.log("Creating Gold Standard course...");
    
    // Add status property for the DB
    const courseToInsert = {
        ...goldCourse,
        status: "live",
        content_json: goldCourse.modules // The DB schema usually maps content_json to modules array if that's what frontend expects, or maybe { modules: goldCourse.modules }
    };
    
    // Wait, let's check create_course.js structure: content_json: { modules: [...] }
    courseToInsert.content_json = { modules: goldCourse.modules };
    // delete modules from root
    delete courseToInsert.modules;
    delete courseToInsert.video_bg_url;
    delete courseToInsert.video_query;

    const { data, error } = await supabase.from('courses').insert([courseToInsert]).select();

    if (error) {
        console.error("Error creating course:", error);
    } else {
        console.log("Course created successfully:", data[0].title);
        console.log("ID:", data[0].id);
    }
}

create();
