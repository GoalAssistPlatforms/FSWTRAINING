import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase keys in env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugCourse() {
    console.log("Searching for 'Farming' course...");
    const { data: courses, error } = await supabase
        .from('courses')
        .select('*')
        .ilike('title', '%Farming%');

    if (error) {
        console.error("Supabase Error:", error);
        return;
    }

    if (!courses || courses.length === 0) {
        console.log("No course found matching 'Farming'");
        return;
    }

    const course = courses[0];
    console.log("Course Found:", course.title);
    console.log("--------------------------------");

    let content = course.content_json;
    if (typeof content === 'string') {
        try {
            content = JSON.parse(content);
        } catch (e) {
            console.error("Failed to parse content_json:", e);
            console.log("Raw Content:", content);
            return;
        }
    }

    console.log("Structure Valid:", !!content.modules);
    if (content.modules) {
        content.modules.forEach((mod, i) => {
            console.log(`Module ${i}: ${mod.title}`);
            if (!mod.lessons) {
                console.error(`  ⚠️ Module ${i} has no lessons array!`);
                return;
            }
            mod.lessons.forEach((less, j) => {
                console.log(`  Lesson ${j}: ${less.title}`);
                console.log(`    Gamma URL:`, less.gamma_url);
                console.log(`    Audio URL:`, less.audio_url ? "Present" : "Missing");

                if (!less.gamma_url) console.warn("    ⚠️ MISSING GAMMA URL");
                if (!less.audio_url) console.warn("    ⚠️ MISSING AUDIO URL");
            });
        });
    } else {
        console.error("⚠️ Invalid content structure: 'modules' missing");
        console.log(JSON.stringify(content, null, 2));
    }
}

debugCourse();
