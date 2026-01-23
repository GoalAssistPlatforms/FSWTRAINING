import OpenAI from 'openai';
import { createPresentation } from './gamma.js';
import { supabase } from './supabase.js';
import { generateThumbnail } from './images.js';
import { createAudio } from './elevenlabs.js';

const openai = new OpenAI({
    apiKey: (import.meta.env && import.meta.env.VITE_OPENAI_API_KEY) || (typeof process !== 'undefined' && process.env.VITE_OPENAI_API_KEY),
    dangerouslyAllowBrowser: true // Allowed for this client-side demo
});

if (!openai.apiKey) {
    console.error("CRITICAL: OpenAI API Key is missing in client environment!");
}


const FSW_INTERNAL_CONTEXT = `
FSW Brand Voice and Context:
FSW is the UK's leading distributor of air conditioning and refrigeration products.
- Tone: Professional, authoritative, efficient, and safety-conscious.
- Core Business: Wholesale distribution of compressors, refrigerants, tools, and systems (split systems, VRF, etc.).
- Target Audience: FSW Staff (Internal Training).
- Persona for AI: "The FSW Training Team" - we are internal colleagues, not external consultants. 

CRITICAL BRANDING INSTRUCTIONS:
1. ALWAYS use "We", "Our", and "Us" when referring to FSW. 
   - BAD: "FSW offers..." or "The company provides..."
   - GOOD: "We offer..." or "Our branches stock..."
2. ALWAYS link learning back to FSW operations.
   - Example: "When you're at the trade counter..."
   - Example: "Our customers rely on us to know this..."
   - Example: "This is a common issue returned to our warranty department..."
3. Make it feel INTERNAL. Use phrases like "Here at FSW", "In our branches", "As part of the FSW team".

Content Guidelines:
- LANGUAGE: Use UK English spelling ONLY (e.g., "analyse", "colour", "centre", "programme", "organisation").
- If the topic is TECHNICAL (e.g., "Compressors"): Use specific RAC terminology (e.g., evaporator, thermal expansion valve, flare nut).
- If the topic is SOFT SKILLS / OPERATIONAL (e.g., Sales, HR, Management): Use relevant FSW scenarios (e.g., "dealing with a busy trade counter", "handling a warranty claim for a compressor").
- Avoid forced technical jargon if not relevant.

FORMATTING & CONTEXT (CRITICAL):
- This is an ONLINE, SELF-PACED course, NOT a live presentation.
- Do NOT use phrases like "Presented by", "Welcome to my presentation", "Any questions?", "Thank you for listening", or "We are now open for questions".
- Do NOT include a Q&A section at the end.
- The content should be direct and informational, suitable for reading or listening without a live presenter, but written as if 'WE' (FSW) are teaching 'YOU' (the employee).
`;

/**
 * Generates a full course structure and content.
 * @param {string} topic
 */
/**
 * Generates a full course structure and content.
 * @param {string} topic
 * @param {string} supportingDocs - Optional text content from uploaded files
 * @param {function} onProgress - Callback for real-time progress updates
 */
export const generateCourseContent = async (topic, supportingDocs = "", onProgress = () => { }) => {
    console.log(`Starting AI generation for: ${topic}`);
    onProgress(`Analyzing topic: "${topic}"...`);

    // 1. Generate Course Outline (Modules & Lessons)
    onProgress("Drafting course outline...");

    let systemPrompt = `${FSW_INTERNAL_CONTEXT}
                
    You are an expert instructional designer. Create a comprehensive course outline for the topic provided. 
    Return ONLY a JSON object with this structure:
    {
        "title": "Course Title (Max 50 Characters)",
        "description": "Short description (100-140 Characters)",
        "thumbnail_query": "A precise visual description of a single physical object that metaphorically represents this topic (e.g. 'a brass compass' for direction, 'a steel padlock' for security). Do NOT use people or abstract concepts.",
        "modules": [
            {
                "title": "Module Title",
                "lessons": [
                    { "title": "Lesson Title", "concept": "Key concept to teach" }
                ]
            }
        ]
    }
    
    CRITICAL CONSTRAINTS:
    1. Use UK English spelling.
    2. The "title" MUST be 50 characters or fewer for UI consistency.
    3. The "description" MUST be between 100 and 140 characters.
    4. Create a comprehensive structure, typically 3-4 modules with 2-3 lessons each.
    `;

    if (supportingDocs) {
        systemPrompt += `\n\nADDITIONAL CONTEXT FROM UPLOADED DOCUMENTS:\n${supportingDocs}\n\nUse the information above to ensure the course outline is tailored to the specific policies, procedures, or content provided in the documents.`;
    }

    const outlineCompletion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: systemPrompt
            },
            { role: "user", content: `Topic: ${topic}` }
        ],
        response_format: { type: "json_object" }
    });

    const outline = JSON.parse(outlineCompletion.choices[0].message.content);
    console.log("Outline generated:", outline);

    // Count total lessons for progress tracking
    let totalLessons = 0;
    if (outline.modules) {
        outline.modules.forEach(m => totalLessons += (m.lessons ? m.lessons.length : 0));
    }
    let completedLessons = 0;

    onProgress(`Outline confirmed: ${outline.title}. Generated ${outline.modules.length} modules with ${totalLessons} total lessons.`);

    // 2. Generate Content for Each Lesson (Sequential with Retry)

    // Distribute activities across the entire course to ensure variety
    const ACTIVITY_TYPES = ['ai-tone', 'ai-dojo', 'ai-redline', 'ai-debate', 'ai-swipe'];

    // Helper to shuffle array
    const shuffle = (array) => {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    };

    // Flatten all lessons to assign activities linearly
    const allLessons = [];
    outline.modules.forEach(m => {
        if (m.lessons) {
            m.lessons.forEach(l => allLessons.push(l));
        }
    });

    if (allLessons.length > 0) {
        let activityQueue = [];
        let lastActivity = null;

        // Create a large enough queue of balanced activities
        // We need enough full sets to cover all lessons
        const setsNeeded = Math.ceil(allLessons.length / ACTIVITY_TYPES.length) + 1;

        for (let i = 0; i < setsNeeded; i++) {
            // Shuffle a full set of types
            let set = shuffle([...ACTIVITY_TYPES]);

            // Basic check to prevent boundary duplicate (last of prev set == first of new set)
            if (lastActivity && set[0] === lastActivity) {
                // Swap first with something else
                [set[0], set[1]] = [set[1], set[0]];
            }

            // Add to queue
            activityQueue.push(...set);
            lastActivity = set[set.length - 1]; // update for next iteration check
        }

        // Assign to lessons (ensuring no consecutive duplicates if random shuffle failed slightly, though the set logic helps)
        for (let i = 0; i < allLessons.length; i++) {
            let selectedActivity = activityQueue.shift();

            // Double check for consecutive duplicates (if queue somehow had them or we just want to be safe)
            if (i > 0 && allLessons[i - 1].targetActivity === selectedActivity) {
                // If duplicate, swap with next in queue
                const next = activityQueue.shift();
                activityQueue.push(selectedActivity); // Put the duplicate back for later
                selectedActivity = next;
            }

            allLessons[i].targetActivity = selectedActivity;
            console.log(`[AI] Assigned ${selectedActivity} to lesson "${allLessons[i].title}"`);
        }
    }

    for (const module of outline.modules) {
        for (const lesson of module.lessons) {
            completedLessons++;
            const progressPrefix = `[${completedLessons}/${totalLessons}]`;
            console.log(`[AI] Generating content for: ${lesson.title}`);
            onProgress(`${progressPrefix} Writing lesson: "${lesson.title}"...`);

            let attempts = 0;
            let success = false;

            while (!success && attempts < 2) {
                attempts++;
                try {
                    let lessonSystemPrompt = `${FSW_INTERNAL_CONTEXT}
                                
                                You are an expert audio-visual course creator.
                                
                                **OBJECTIVE**: Create a 10-slide visual presentation script and a written lesson.
                                **CONTEXT**: You are writing a specific lesson within a larger course. 
                                COURSE TITLE: "${outline.title}"
                                MODULE: "${module.title}"
                                THIS LESSON: "${lesson.title}"
                                FULL OUTLINE: ${JSON.stringify(outline.modules.map(m => ({ title: m.title, lessons: m.lessons.map(l => l.title) })))}
                                
                                Ensure this lesson flows naturally from previous ones and leads into the next.
                                
                                Output JSON format:
                                {
                                    "presentation_input": "Detailed script content for the 10 slides, including bullet points and headers. This will be sent to Gamma AI.",
                                    "audio_summary": "A detailed 3-4 minute (approx 600-800 words) audio script covering the ENTIRE lesson deeply. It should be engaging, professional, and flow like a podcast or expert briefing.",
                                    "markdown_content": "Detailed markdown content (Min 800 words) for the reading mode...",
                                    "quiz": [
                                        { "question": "...", "options": ["A", "B", "C", "D"], "correct_index": 0, "explanation": "Brief context." }
                                    ],
                                    "ai_component": {
                                        "type": "${lesson.targetActivity || 'ai-tone'}",
                                        "config": { ... }
                                    }
                                }

                                CRITICAL CONSTRAINTS:
                                1. **presentation_input**: Needs to be structured for a slide deck.
                                2. **audio_summary**: This is crucial. It must be LONG and comprehensive.
                                3. **markdown_content**: Must be UK English. Include '### Interactive Activity' header if component is used.
                                4. **quiz**: Must contain exactly 3 questions.
                                5. **ai_component**: YOU MUST GENERATE A COMPONENT OF TYPE "${lesson.targetActivity}". CREATE A SENSIBLE ACTIVITY OF THIS TYPE THAT RELATES TO THE LESSON CONTENT.
                                
                                AI Component Configs:
                                - ai-tone: { "context": "Brief context...", "incoming_email": "The full text of the email the user must reply to. Make it realistic and relevant to the lesson.", "initialText": "" }
                                - ai-dojo: { "scenarioId": "generated_id", "intro": "Scenario intro regarding the PLAYER'S situation...", "role": "Role for AI to play", "objective": "Goal for user", "skills": ["Skill 1", "Skill 2"], "initialText": "A realistic opening line for the AI character to start the call." }
                                - ai-redline: { "title": "Audit Document Name", "items": [{ "content": "Full sentence describing a policy or statement found in the document...", "isRisk": true, "feedback": "Explanation of why this is a mistake." }, { "content": "Another statement that is compliant...", "isRisk": false }] } (CRITICAL: "items" array is REQUIRED. Generate 5-7 items total. Approx 2/3 should be RISKS ('isRisk': true) and 1/3 should be safe.)
                                - ai-debate: { "topic": "Debate topic...", "aiSide": "pro/con/devil_advocate", "stances": ["Option A", "Option B"] } (CRITICAL: Provide "stances" if the topic isn't a simple Agree/Disagree, e.g. ["Prioritise Relationships", "Prioritise Speed"])
                                - ai-swipe: { "title": "Decision Scenario", "cards": [{ "text": "Option...", "isCorrect": true, "feedback": "Why..." }], "labels": { "left": "Reject", "right": "Accept" } } (CRITICAL: Generate a MINIMUM of 5 cards)
                                `;

                    if (supportingDocs) {
                        lessonSystemPrompt += `\n\nADDITIONAL CONTEXT FROM UPLOADED DOCUMENTS:\n${supportingDocs}\n\nUse this information extensively to ensure the lesson content is factually accurate and aligned with the provided documents.`;
                    }

                    const contentCompletion = await openai.chat.completions.create({
                        model: "gpt-4o",
                        messages: [
                            {
                                role: "system",
                                content: lessonSystemPrompt
                            },
                            { role: "user", content: `Concept to teach: ${lesson.concept}` }
                        ],
                        response_format: { type: "json_object" }
                    });

                    const contentData = JSON.parse(contentCompletion.choices[0].message.content);

                    // VALIDATION
                    if (contentData.ai_component) {
                        const { type, config } = contentData.ai_component;
                        if (type === 'ai-redline') {
                            if (!config || (!config.items && !config.mistakes)) {
                                throw new Error("AI-Redline component generated without 'items' or 'mistakes'. Retrying...");
                            }
                        }
                    }

                    // SANITIZATION
                    if (contentData.markdown_content) {
                        contentData.markdown_content = contentData.markdown_content.replace(/\\n/g, '\n');
                    }
                    if (contentData.audio_summary) {
                        contentData.audio_summary = contentData.audio_summary.replace(/\\n/g, '\n');
                    }

                    onProgress(`${progressPrefix} Generating audio & slides for "${lesson.title}"...`);

                    // Parallel Execution
                    const [gammaUrl, audioUrl] = await Promise.all([
                        createPresentation(lesson.title, contentData.presentation_input).catch(err => {
                            console.error("[AI] Gamma failed:", err);
                            return null;
                        }),
                        createAudio(contentData.audio_summary).catch(err => {
                            console.error("[AI] Audio failed:", err);
                            return null;
                        })
                    ]);

                    // Append AI interactive component
                    let finalContent = contentData.markdown_content || "";
                    if (contentData.ai_component && contentData.ai_component.type) {
                        const componentCode = `\n\n\`\`\`${contentData.ai_component.type}\n${JSON.stringify(contentData.ai_component.config, null, 2)}\n\`\`\``;
                        if (!finalContent.includes('### Interactive Activity')) {
                            finalContent += `\n\n### Interactive Activity\n${componentCode}`;
                        } else {
                            finalContent += `\n${componentCode}`;
                        }
                    }

                    // Update lesson
                    lesson.content = finalContent;
                    lesson.quiz = contentData.quiz;
                    lesson.gamma_url = gammaUrl;
                    lesson.audio_url = audioUrl;
                    lesson.ai_component = contentData.ai_component;

                    success = true;
                    onProgress(`${progressPrefix} Finished "${lesson.title}".`);

                } catch (error) {
                    console.error(`[AI] Error processing lesson ${lesson.title} (Attempt ${attempts}):`, error);
                    if (attempts >= 2) { // 2 attempts total
                        lesson.content = "Lesson content failed to generate after retries.";
                        onProgress(`${progressPrefix} FAILED "${lesson.title}" - content generation error.`);
                    } else {
                        onProgress(`${progressPrefix} Error in "${lesson.title}" (${error.message || 'unknown'}), retrying...`);
                    }
                }
            }
        }
    }

    // Thumbnail
    onProgress("Generating course thumbnail...");
    const imageQuery = outline.thumbnail_query || outline.title;
    const thumbnail = await generateThumbnail(imageQuery).catch(e => {
        console.error("[AI] Thumbnail failed:", e);
        return null;
    });

    onProgress("Finalizing course...");
    return {
        title: outline.title,
        description: outline.description,
        thumbnail_url: thumbnail,
        modules: outline.modules
    };
};

/**
 * Handles real-time chat for the Dojo Roleplay component
 */
export const chatWithDojo = async (messages, scenario) => {
    let attempts = 0;
    while (attempts < 3) {
        try {
            // Map internal 'ai' role to OpenAI 'assistant' role
            const apiMessages = messages.map(m => ({
                role: m.role === 'ai' ? 'assistant' : m.role,
                content: m.content
            }));

            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `${FSW_INTERNAL_CONTEXT}
                You are playing a role in a training simulation for FSW.
                ROLE: ${scenario.role}
                OBJECTIVE FOR USER: ${scenario.objective}
                SCENARIO INTRO: ${scenario.intro}
                USER CONTEXT (The Player): ${scenario.intro}
                CRITICAL RULES:
                1. The USER CONTEXT describes the human player's role. Do NOT assume this is your role. You are strictly the character defined in ROLE.
                2. STICK TO YOUR SIDE OF THE CONVERSATION. You are strictly the character defined in ROLE.
                3. You are NOT an AI assistant, mentor, or helpful guide.
                4. NEVER do the user's work for them. If the objective is for the USER to build, create, plan, or list something, you must wait for them to do it.
                5. If the user asks you to provide a framework, list, or answer, REFUSE IN CHARACTER (e.g., "I'm waiting for your proposal," or "That's what I hired you for").
                6. Ask probing questions to guide them if they are stuck, but NEVER provide the solution yourself.

                Stay in character. If the user achieves the objective, add [SUCCESS] at the end.
                `
                    },
                    ...apiMessages
                ]
            });
            return completion.choices[0].message.content;
        } catch (error) {
            console.error(`Dojo Chat attempt ${attempts + 1} failed:`, error);
            attempts++;
            if (attempts >= 3) {
                console.warn("Falling back to offline simulation mode.");
                return getFallbackResponse(messages, scenario);
            }
            // Short exponential backoff: 500ms, 1000ms
            await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempts - 1)));
        }
    }
};

/**
 * Fallback logic when AI is offline/failing
 */
const getFallbackResponse = (messages, scenario) => {
    const lastUserMessage = messages[messages.length - 1]?.content.toLowerCase() || "";

    // Generic "dumb" simulation to allow completion
    // Check if it looks like they are closing or solving the problem
    if (lastUserMessage.includes('thank') || lastUserMessage.includes('great') || lastUserMessage.includes('book') || lastUserMessage.includes('schedule') || lastUserMessage.includes('survey')) {
        return "That sounds perfect. Let's go ahead with that. Thank you for your help! [SUCCESS]";
    }

    return "I understand. Could you tell me more about how we can proceed with this? I'm quite interested in getting this sorted.";
};

/**
 * Handles Socratic Debate logic
 */
/**
 * Handles Socratic Debate logic
 */
export const chatWithDebater = async (messages, topic, aiSide, pointNumber = 1) => {
    const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: `${FSW_INTERNAL_CONTEXT}
                You are a skilled Socratic Debater and Critical Thinker.
                
                TOPIC: ${topic}
                YOUR STANCE: ${aiSide === 'pro' ? 'Favoring' : 'Opposing'} the topic.
                CURRENT POINT: ${pointNumber} of 5.

                OBJECTIVE: 
                Conduct a Socratic Seminar by discussing exactly 5 distinct, sequential points or questions that challenge the user's view.
                
                RULES:
                1. Discuss ONE point at a time.
                2. Do not pile on multiple questions. Focus on one specific aspect of the topic.
                3. Wait for the user's response before moving to the next point.
                4. KEEP IT CONCISE. Your response should be under 50 words.
                5. If this is Point 1, briefly acknowledge their stance and dive into the first question.
                6. If this is Point 5, this is your final inquiry.
                7. Maintain a professional, curious, and challenging tone (Socratic Method).
                
                CONTEXT: The user has already stated their stance. You are now exploring the depths of that stance.
                `
            },
            ...messages
        ]
    });
    return completion.choices[0].message.content;
};

/**
 * Analyzes tone of user draft against a specific email context
 */
export const analyzeTone = async (userText, context, incomingEmail) => {
    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            {
                role: "system",
                content: `${FSW_INTERNAL_CONTEXT}
                You are a Professional Communications Coach at FSW.
                
                Task: Analyze the user's reply to an email.
                Context: ${context}
                Incoming Email (that they are replying to): "${incomingEmail}"
                
                Analyze the User's Draft for:
                1. Professionalism (appropriate framing, no slang)
                2. Tone (confident, helpful, direct but polite)
                3. Effectiveness (does it actually answer the incoming email?)
                
                Return JSON:
                {
                    "score": number (0-100),
                    "feedback": "A short, constructive paragraph (max 2 sentences) giving specific advice on how to improve. Address the user directly."
                }
                `
            },
            { role: "user", content: userText }
        ],
        response_format: { type: "json_object" }
    });

    return JSON.parse(completion.choices[0].message.content);
};
