import { uploadToCloudinary } from './images.js';

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
    },
    apiKey: 'proxied'
};

const SYSTEM_PROMPT = `
Role: You are an elite Creative Director and Presentation Designer for FSW. Your job is to convert raw information into visually stunning, minimalist, and highly effective presentation slides.

Goal: Generate a strict JSON array of slides based on the user's input.

Design Principles:
1. Less is More: Never overcrowd a slide. Use bullet points (\`feature-list\`) or grids (\`bento-grid\`) instead of long paragraphs.
2. Global Slide Layout: Never use full-screen background images as they make text hard to read. Instead, use the \`layout\` property on the slide.
   - Use \`center\` for clean, text-heavy, or highly structural slides (like charts or pyramids).
   - Use \`split-left\` or \`split-right\` to place a massive, edge-to-edge image on one side of the slide. If you choose a split layout, you MUST provide a highly descriptive \`slideImagePrompt\`.
3. Choose the Right Block:
   - If comparing two things (Old vs New, Basic vs Pro), use \`comparison\` or \`table\`.
   - If explaining a process, history, or step-by-step guide, use \`timeline\`.
   - If highlighting a massive achievement or metric, use \`stat\`.
   - If showing percentages or performance data, use \`chart\`.
   - If grouping 3-5 related concepts, use \`bento-grid\` or \`feature-list\`.
4. Micro-Imagery: When using a \`bento-grid\`, you must decide when to use images inside the cards. Do not use images on every card. Balance text and visuals. When an image is needed, provide a highly descriptive \`imagePrompt\`.
5. Narration: Write a compelling \`narrationScript\` for each slide. This is what the voiceover will say. It should expand on the bullet points, not just read them verbatim. Keep it engaging.
6. Structure: Every slide should have a clear \`slideTitle\`.

JSON Schema:
{
  "slides": [
    {
      "slideTitle": "String - The high-level topic of the slide",
      "narrationScript": "String - The exact script the AI Voiceover should read",
      "layout": "center | split-left | split-right",
      "slideImagePrompt": "String - Search query/description if using a split layout, else empty",
      "elements": [
        // One or more Block Objects
      ]
    }
  ]
}

Block Objects Reference:
*   \`text\`: { "type": "text", "typography": "h1|h2|p|caption", "content": "String" }
*   \`quote\`: { "type": "quote", "content": "String", "attribution": "String" }
*   \`stat\`: { "type": "stat", "number": "String (e.g., 85%)", "label": "String" }
*   \`callout\`: { "type": "callout", "variant": "info|warning|success", "icon": "Emoji", "content": "String" }
*   \`comparison\`: { "type": "comparison", "left": { "title": "String", "content": "String" }, "right": { "title": "String", "content": "String" } }
*   \`table\`: { "type": "table", "headers": ["String", "String", "String"], "items": [ { "col1": "String", "col2": "String", "col3": "String" } ] }
*   \`timeline\`: { "type": "timeline", "items": [ { "title": "String", "content": "String" } ] }
*   \`feature-list\`: { "type": "feature-list", "items": [ { "title": "String", "content": "String" } ] }
*   \`bento-grid\`: { "type": "bento-grid", "items": [ { "title": "String", "content": "String", "imagePrompt": "Search query if an image is needed, else empty string" } ] }
*   \`chart\`: { "type": "chart", "items": [ { "title": "Label String", "content": "Number String (0-100)" } ] }
*   \`pyramid\`: { "type": "pyramid", "items": [ { "title": "Top", "content": "..." }, { "title": "Base", "content": "..." } ] }

Output format: You must output ONLY valid JSON matching the provided schema. Do not wrap in markdown tags or provide conversational text.
`;

export async function generateBespokeSlides(topic, onProgress) {
    if (!openrouter.apiKey) {
        throw new Error("OpenRouter API Key is missing. Please check your .env file.");
    }

    try {
        if (onProgress) onProgress("Drafting presentation structure with AI...");
        const completion = await openrouter.chat.completions.create({
            model: "openai/gpt-4o",
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: `Create a comprehensive, 5-7 slide presentation on the following topic: ${topic}` }
            ]
        });

        const rawJson = completion.choices[0].message.content;
        const presentation = JSON.parse(rawJson);

        if (onProgress) onProgress("AI structure complete. Fetching media assets...");
        return await enhanceBespokeSlidesWithImages(presentation.slides, onProgress);
    } catch (err) {
        console.error("AI Generation Error:", err);
        throw err;
    }
}

async function enhanceBespokeSlidesWithImages(slides, onProgress) {
    const processImagePrompt = async (prompt) => {
        if (!prompt || prompt.trim() === "") return "";
        // Use free instant pollinations AI for sandbox demo
        const randomSeed = Math.floor(Math.random() * 100000);
        return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${randomSeed}`;
    };

    let totalImages = 0;
    let loadedImages = 0;

    // Count total images needed
    for (let slide of slides) {
        if (slide.slideImagePrompt) totalImages++;
        if (slide.elements) {
            for (let el of slide.elements) {
                if (el.type === 'bento-grid' && el.items) {
                    for (let item of el.items) {
                        if (item.imagePrompt) totalImages++;
                    }
                }
            }
        }
    }

    if (totalImages === 0) {
        if (onProgress) onProgress("Finalizing deck...");
        return slides;
    }

    // Fetch images with progress
    for (let slide of slides) {
        if (slide.slideImagePrompt) {
            const url = await processImagePrompt(slide.slideImagePrompt);
            slide.background = `url('${url}')`;
            loadedImages++;
            if (onProgress) onProgress(`Generating media assets (${loadedImages}/${totalImages})...`);
        }

        if (slide.elements) {
            for (let el of slide.elements) {
                if (el.type === 'bento-grid' && el.items) {
                    for (let item of el.items) {
                        if (item.imagePrompt) {
                            item.bgImage = await processImagePrompt(item.imagePrompt);
                            loadedImages++;
                            if (onProgress) onProgress(`Generating media assets (${loadedImages}/${totalImages})...`);
                        }
                    }
                }
            }
        }
    }

    if (onProgress) onProgress("Finalizing deck...");
    return slides;
}

async function generateDalleImage(prompt) {
    const randomSeed = Math.floor(Math.random() * 100000);
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&model=flux&seed=${randomSeed}`;
}

export async function generateBespokeSlidesTrial(topic, onProgress) {
    try {
        if (onProgress) onProgress("Drafting structure with AI (Trial)...");
        const completion = await openrouter.chat.completions.create({
            model: "openai/gpt-4o",
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: `Create a comprehensive, 5-7 slide presentation on the following topic: ${topic}` }
            ]
        });

        const rawJson = completion.choices[0].message.content;
        const presentation = JSON.parse(rawJson);

        if (onProgress) onProgress("AI structure complete. Generating FSW DALL-E images...");
        return await enhanceBespokeSlidesWithImagesTrial(presentation.slides, onProgress);
    } catch (err) {
        console.error("AI Trial Generation Error:", err);
        throw err;
    }
}

async function enhanceBespokeSlidesWithImagesTrial(slides, onProgress) {
    const processImagePrompt = async (prompt) => {
        if (!prompt || prompt.trim() === "") return "";
        
        const stylePrefix = "A beautifully clean, modern, flat 2D vector graphic illustration of";
        const styleSuffix = ". The aesthetic is premium corporate minimalist, similar to Stripe or Duolingo marketing assets. Use the FSW brand color palette (Navy Blue, Bright Blue, Green, and White). Solid colors, crisp clean lines, no shading, strictly flat 2D graphic design style. CRITICAL: Do not make it photorealistic or 3D. It must look like a high-end vector illustration. No text.";
        const fullPrompt = `${stylePrefix} ${prompt}${styleSuffix}`;
        
        const tempUrl = await generateDalleImage(fullPrompt);
        const persistentUrl = await uploadToCloudinary(tempUrl, "slide_image");
        return persistentUrl;
    };

    let totalImages = 0;
    let loadedImages = 0;

    for (let slide of slides) {
        if (slide.slideImagePrompt) totalImages++;
        if (slide.elements) {
            for (let el of slide.elements) {
                if (el.type === 'bento-grid' && el.items) {
                    for (let item of el.items) {
                        if (item.imagePrompt) totalImages++;
                    }
                }
            }
        }
    }

    if (totalImages === 0) {
        if (onProgress) onProgress("Finalizing deck...");
        return slides;
    }

    for (let slide of slides) {
        if (slide.slideImagePrompt) {
            try {
                if (onProgress) onProgress(`Generating FSW DALL-E asset (${loadedImages + 1}/${totalImages})...`);
                const url = await processImagePrompt(slide.slideImagePrompt);
                slide.background = `url('${url}')`;
                loadedImages++;
            } catch (err) {
                console.error("Failed to generate slide image, falling back:", err);
            }
        }

        if (slide.elements) {
            for (let el of slide.elements) {
                if (el.type === 'bento-grid' && el.items) {
                    for (let item of el.items) {
                        if (item.imagePrompt) {
                            try {
                                if (onProgress) onProgress(`Generating FSW DALL-E asset (${loadedImages + 1}/${totalImages})...`);
                                item.bgImage = await processImagePrompt(item.imagePrompt);
                                loadedImages++;
                            } catch (err) {
                                console.error("Failed to generate bento image:", err);
                            }
                        }
                    }
                }
            }
        }
    }

    if (onProgress) onProgress("Finalizing deck...");
    return slides;
}

