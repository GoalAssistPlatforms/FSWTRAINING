import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load .env
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

const newCourse = {
    title: "Effective Onboarding for Finance Staff",
    description: "A specialized course designed to ensure a smooth and effective integration for new finance staff members, covering key protocols, tools, and cultural values.",
    thumbnail_url: "https://res.cloudinary.com/dm1mue41j/image/upload/v1769115404/zpitp2clodabwdoauvqg.jpg",
    status: "live",
    content_json: {
        modules: [
            {
                title: "Module 1: Finance Department Overview",
                lessons: [
                    {
                        title: "1.1 Introduction to Finance Tools",
                        content: "# Finance Tools\n\nWelcome to the finance team.",
                        quiz: []
                    }
                ]
            }
        ]
    }
};

async function create() {
    console.log("Creating course...");
    const { data, error } = await supabase.from('courses').insert([newCourse]).select();

    if (error) {
        console.error("Error creating course:", error);
    } else {
        console.log("Course created successfully:", data[0].title);
        console.log("ID:", data[0].id);
        console.log("Thumbnail:", data[0].thumbnail_url);
    }
}

create();
