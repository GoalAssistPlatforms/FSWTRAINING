
const openrouter = {
    chat: {
        completions: {
            create: async (payload) => {
                const res = await fetch('/api/openai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    throw new Error(`OpenRouter Proxy Error: ${res.status}`);
                }
                return res.json();
            }
        }
    }
};

/**
 * Uploads an image URL to Cloudinary and returns the secure URL.
 * Throws an error if upload fails.
 * @param {string} imageUrl - Temporary URL from OpenAI
 * @param {string} topic - Topic for filename generation (optional, for tagging/naming if needed)
 */
export async function uploadToCloudinary(imageUrl, topic) {
    const cloudName = (import.meta.env && import.meta.env.VITE_CLOUDINARY_CLOUD_NAME) || (typeof process !== 'undefined' && process.env.VITE_CLOUDINARY_CLOUD_NAME);
    const uploadPreset = (import.meta.env && import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET) || (typeof process !== 'undefined' && process.env.VITE_CLOUDINARY_UPLOAD_PRESET);

    console.log('[Images.js] ENV DEBUG:', {
        cloudName: cloudName,
        uploadPreset: uploadPreset,
        envVite: import.meta.env?.VITE_CLOUDINARY_UPLOAD_PRESET
    });

    if (!cloudName || !uploadPreset) {
        console.error('Missing Cloudinary credentials in .env');
        throw new Error('Missing Cloudinary credentials in .env');
    }

    console.log(`Starting Cloudinary upload with preset: "${uploadPreset}"`);

    // 1. Prepare FormData for Cloudinary (Cloudinary accepts Data URIs directly)
    const formData = new FormData();
    formData.append('file', imageUrl); // Pass the base64 data URI directly
    formData.append('upload_preset', uploadPreset);
    // Add context/tags if useful for management
    formData.append('context', `caption=${topic}`);
    formData.append('tags', `course_thumbnail,${topic.replace(/\s+/g, '_')}`);

    // 3. Upload to Cloudinary
    const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: formData
    });

    if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        const errorMessage = errorData.error?.message || uploadResponse.statusText;

        if (errorMessage.includes('must be whitelisted for unsigned')) {
            console.error('CRITICAL CLOUDINARY CONFIG ERROR: The upload preset is set to "Signed". It must be "Unsigned".');
            throw new Error('Cloudinary Preset is "Signed" but must be "Unsigned". Check Cloudinary Console.');
        }

        throw new Error(`Cloudinary upload failed: ${errorMessage}`);
    }

    const data = await uploadResponse.json();
    console.log('Successfully uploaded to Cloudinary:', data.secure_url);
    return data.secure_url;
}

/**
 * Generates a visual description for a given topic using GPT-4o-mini.
 * Converts abstract concepts into concrete physical objects.
 * @param {string} topic
 * @returns {Promise<string>}
 */
async function getVisualDescription(topic) {
    try {
        const completion = await openrouter.chat.completions.create({
            model: "openai/gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are a visual prompt engineer. Your job is to convert abstract course topics into a SINGLE, CONCRETE, PHYSICAL OBJECT that represents the topic metaphorically. 
                    
                    RULES:
                    1. Output ONLY the visual description. No explanations.
                    2. DO NOT include people, faces, human limbs, or text of any kind.
                    3. The object must be the MOST RECOGNIZABLE symbol for the topic.
                    4. The object must be suitable for a clean, flat 2D vector graphic illustration.
                    5. Examples:
                       - "Introduction to Recruitment" -> "A magnifying glass resting on a stack of premium paper resumes"
                       - "Time Management" -> "A clean flat vector calendar icon"
                       - "Leadership" -> "A chess king piece"
                       - "Conflict Resolution" -> "A balanced scale made of brass"
                       - "Cloud Computing" -> "A glowing server rack module"
                    `
                },
                { role: "user", content: `Topic: ${topic}` }
            ]
        });
        return completion.choices[0].message.content.trim();
    } catch (error) {
        console.warn("Failed to generate visual description, falling back to raw topic:", error);
        return topic;
    }
}

/**
 * Generates a thumbnail URL based on a prompt.
 * Enforces a "simple, cinematic, luxury" aesthetic.
 * RETRY POLICY: Matches strict requirements (3 image gens, 3 upload attempts each).
 * @param {string} topic - The topic of the course.
 * @returns {Promise<string|null>} - The URL of the generated image, or null if failed.
 */
export const generateThumbnail = async (topic) => {
    const MAX_GENERATION_ATTEMPTS = 3;
    const MAX_UPLOAD_ATTEMPTS = 3;

    for (let genAttempt = 1; genAttempt <= MAX_GENERATION_ATTEMPTS; genAttempt++) {
        try {
            console.log(`[Thumbnail] Generation Attempt ${genAttempt}/${MAX_GENERATION_ATTEMPTS} for topic: ${topic}`);

            // 1. Get a concrete visual description
            const visualSubject = await getVisualDescription(topic);
            console.log(`[Thumbnail] Visual Subject generated: "${visualSubject}"`);

            // Aesthetic enforcement (Clean, modern flat 2D graphics)
            const stylePrefix = "A beautifully clean, modern, flat 2D vector graphic illustration of";
            const styleSuffix = ". The aesthetic is premium corporate minimalist, similar to Stripe or Duolingo marketing assets. Use the FSW brand color palette (Navy Blue, Bright Blue, Green, and White). Solid colors, crisp clean lines, no shading, strictly flat 2D graphic design style. CRITICAL: Do not make it photorealistic or 3D. It must look like a high-end vector illustration. No text.";
            const fullPrompt = `${stylePrefix} ${visualSubject}${styleSuffix}`;

            // 2. Generate Image via Pollinations.ai (Free, reliable, no API key required)
            // Upgraded to use FLUX.1 model for massive quality improvements
            const tempImageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?width=1024&height=1024&nologo=true&model=flux`;
            console.log(`[Thumbnail] Using Pollinations FLUX API URL...`);

            // 3. Retry Loop for Uploading THIS specific image
            for (let uploadAttempt = 1; uploadAttempt <= MAX_UPLOAD_ATTEMPTS; uploadAttempt++) {
                try {
                    console.log(`[Thumbnail] Upload Attempt ${uploadAttempt}/${MAX_UPLOAD_ATTEMPTS}...`);
                    const persistentUrl = await uploadToCloudinary(tempImageUrl, topic);

                    // IF SUCCESSFUL, WE ARE DONE
                    console.log('[Thumbnail] Success! Persistent URL:', persistentUrl);
                    return persistentUrl;

                } catch (uploadError) {
                    console.error(`[Thumbnail] Upload Attempt ${uploadAttempt} failed:`, uploadError);
                    if (uploadAttempt === MAX_UPLOAD_ATTEMPTS) {
                        console.warn(`[Thumbnail] All upload attempts failed for this image. Discarding image.`);
                        // Throwing here breaks the inner loop, caught by outer loop, triggering a NEW image generation.
                        throw new Error("Max upload attempts reached for this image.");
                    }
                    // Wait briefly before retrying upload (1s)
                    await new Promise(r => setTimeout(r, 1000));
                }
            }

        } catch (genError) {
            console.error(`[Thumbnail] Generation Cycle ${genAttempt} failed:`, genError);
            if (genAttempt === MAX_GENERATION_ATTEMPTS) {
                console.error("[Thumbnail] CRITICAL: All generation and upload attempts failed.");
                return null; // or throw genError if you want to bubble it up
            }
        }
    }

    return null; // Should be unreachable if logic holds, but safe fallback
}


