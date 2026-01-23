import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// 1. Config
const IMAGE_PATH = 'C:/Users/josh/.gemini/antigravity/brain/dfd2cad7-550b-44ca-864d-d5c63746eb83/uploaded_image_1769115107219.jpg';
const COURSE_TITLE = 'Effective Onboarding for Finance Staff';

// 2. Load Env
const envPath = path.resolve(process.cwd(), '.env');
const envConfig = fs.readFileSync(envPath, 'utf8');
envConfig.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) {
    process.env[key.trim()] = value.trim();
  }
});

const CLOUD_NAME = process.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.VITE_CLOUDINARY_UPLOAD_PRESET;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!CLOUD_NAME || !UPLOAD_PRESET || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing configuration");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 3. Main Logic
async function run() {
  try {
    console.log("Reading image...");
    const imageBuffer = fs.readFileSync(IMAGE_PATH);
    // Convert to Blob for FormData
    const blob = new Blob([imageBuffer], { type: 'image/jpeg' });

    console.log("Uploading to Cloudinary (Multipart)...");
    const formData = new FormData();
    formData.append('file', blob, 'upload.jpg');
    formData.append('upload_preset', UPLOAD_PRESET);
    formData.append('context', `caption=${COURSE_TITLE}`);
    // Remove replace regex from tags initially to be safe, or keep if it works
    formData.append('tags', `course_thumbnail,finance_onboarding`);

    const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: formData
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error(`Cloudinary upload failed: ${err}`);
    }

    const uploadData = await uploadRes.json();
    const secureUrl = uploadData.secure_url;
    console.log("Uploaded! URL:", secureUrl);

    console.log(`Updating course '${COURSE_TITLE}'...`);

    // Find ID first to be safe
    const { data: courses, error: findError } = await supabase
      .from('courses')
      .select('id')
      .ilike('title', `%${COURSE_TITLE}%`)
      .limit(1);

    if (findError || !courses.length) {
      throw new Error("Course not found");
    }

    const courseId = courses[0].id;

    const { error: updateError } = await supabase
      .from('courses')
      .update({ thumbnail_url: secureUrl })
      .eq('id', courseId);

    if (updateError) throw updateError;

    console.log("Course updated successfully!");

  } catch (e) {
    console.error("FAILED:", e);
    process.exit(1);
  }
}

run();
