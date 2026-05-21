import OpenAI from 'openai';
import { createPresentation } from './gamma.js';
import { supabase } from './supabase.js';
import { generateThumbnail } from './images.js';
import { createAudio } from './elevenlabs.js';
import { searchCompanyContext } from './guides.js';

const openai = new OpenAI({
    apiKey: (import.meta.env && import.meta.env.VITE_OPENAI_API_KEY) || (typeof process !== 'undefined' && process.env.VITE_OPENAI_API_KEY),
    dangerouslyAllowBrowser: true // Allowed for this client-side demo
});

const openrouter = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: (import.meta.env && import.meta.env.VITE_OPENROUTER_API_KEY) || (typeof process !== 'undefined' && process.env.VITE_OPENROUTER_API_KEY),
    dangerouslyAllowBrowser: true,
    defaultHeaders: {
        "HTTP-Referer": window.location?.href || "http://localhost:5173",
        "X-Title": "FSW Training Platform",
    }
});

if (!openrouter.apiKey) {
    console.error("CRITICAL: OpenRouter API Key is missing in client environment!");
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
   - BAD: "FSW offers...", "The company provides...", "our HVAC company"
   - GOOD: "We offer...", "Our branches stock...", "at FSW"
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
- NEVER invent, hallucinate, or reference non-existent company policies, guides, forms, or help sheets. Do NOT suggest the user refers to external documentation or an intranet unless explicitly provided in the context.
- ANTI-FLUFF: Avoid generic AI introductory or concluding phrases (e.g., 'In conclusion...', 'It is important to note that...', 'Welcome to this module...'). Start directly with the core information.
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

    onProgress(`Searching company knowledge base for "${topic}"...`);
    const companyContext = await searchCompanyContext(topic, 8).catch(e => {
        console.warn("RAG Context fetch failed:", e);
        return "";
    });

    if (companyContext) {
        onProgress(`Found relevant company policies. Synthesizing context...`);
        supportingDocs = supportingDocs 
            ? `${supportingDocs}\n\n--- INTERNAL COMPANY POLICIES ---\n${companyContext}`
            : `--- INTERNAL COMPANY POLICIES ---\n${companyContext}`;
    }

    if (supportingDocs) {
        console.log(`[AI] Using supporting documents: ${supportingDocs.length} chars`);
    }
    
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
        systemPrompt += `\n\nADDITIONAL CONTEXT FROM UPLOADED DOCUMENTS:\n${supportingDocs}\n\nCRITICAL INSTRUCTION: You MUST use the information provided in the documents above. The course outline MUST be directly based on these documents. Prioritize this content over general knowledge.`;
    }

    const outlineCompletion = await openrouter.chat.completions.create({
        model: "openai/gpt-4o",
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
                                    "audio_tracks": [
                                        { "title": "Slide 1: Introduction", "script": "A 30-45 second audio script covering the first slide. Do NOT explicitly mention 'slides' or 'bullet points'. Keep it conversational." },
                                        { "title": "Slide 2: ...", "script": "..." }
                                    ],
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
                                2. **audio_tracks**: This is crucial. Generate an array of tracks corresponding to your presentation slides.
                                   - CRITICAL: Do NOT just read the text on the slide. You MUST expand on the slide content by adding deeper insights, practical examples, or real-world FSW context that the learner wouldn't get just by reading the screen.
                                   - PERSONA: The audio script MUST be written from the perspective of 'Lindsay' from the FSW People & Development department. Lindsay is light, friendly, and approachable. She keeps things simple and easy to understand, avoiding overly technical language unless absolutely necessary.
                                   - LENGTH: Each script MUST be substantial (aim for 150-200 words) to ensure the audio lasts 45-60 seconds.
                                   - TONE: The delivery must sound like a natural, flowing conversation with a colleague, offering valuable "behind-the-scenes" knowledge.
                                3. **markdown_content**: Must be UK English. DO NOT put the Interactive Activity or Quiz inside this string. Introduce them naturally, but let our system render them from the separate JSON keys.
                                4. **quiz**: Must contain exactly 3 questions. MUST be a separate top-level key in the JSON output.
                                5. **ai_component**: YOU MUST GENERATE A COMPONENT OF TYPE "${lesson.targetActivity}". CREATE A SENSIBLE ACTIVITY OF THIS TYPE THAT RELATES TO THE LESSON CONTENT. MUST be a separate top-level key in the JSON output, NOT embedded in markdown_content.

                                **TERMINOLOGY RULES (CRITICAL):**
                                - NEVER use terms like "AI", "AI tool", "chatbot", "swipe tool", "automated system", or "robot".
                                - NEVER say "Interact with the AI below".
                                - INSTREAD USE: "Interactive Simulation", "Scenario", "Module", "Digital Customer", "Virtual Colleague", or the specific premium activity name.
                                - Make the experience feel like high-end professional training software.
                                - NEVER include markdown links to the interactive module in your description text (e.g., do not write \`[Communication Lab]\`).
                                
                                AI Component Configs (Use these PRECISE TITLES):
                                - ai-tone: { "context": "A 1-2 sentence background highlighting a specific issue the sender is facing (e.g., 'A technician is struggling to configure a new VRF system').", "incoming_email": "A realistic, 2-3 paragraph email written in the FIRST PERSON from the sender clearly outlining their problem.", "initialText": "" } (Title: "Communication Lab")
                                  * CRITICAL for ai-tone: The incoming email MUST present a specific problem or issue. The objective is for the USER to draft a reply that effectively resolves the issue, providing clear instructions on what the sender needs to do.
                                - ai-dojo: { "scenarioId": "generated_id", "intro": "A 1-sentence UI stage-setter (e.g., 'You are receiving a call from a site manager experiencing a problem').", "role": "The distinct personality, job title, and CURRENT MOOD of the caller (e.g., 'Frustrated Project Manager facing a system leak').", "objective": "The specific issue the USER must successfully troubleshoot or resolve (e.g., 'Identify that the flare nut is loose and advise them to tighten it.').", "skills": ["Troubleshooting", "Customer Service"], "initialText": "MUST be written in the FIRST PERSON as a realistic, conversational opening where you state your problem. NEVER break character. Start the conversation right away." } (Title: "Live Scenario Simulation")
                                  * CRITICAL for ai-dojo: The scenario MUST revolve around the caller experiencing a problem or issue directly related to the core lesson concept. The user must resolve this issue through the conversation.
                                - ai-redline: { "title": "A realistic internal document title (e.g., 'Q3 Safety Protocol Memo')", "intro": "Formal document header/introduction.", "outro": "Official sign-off or footer.", "items": [{ "content": "A specific, realistic paragraph or clause in the document.", "isRisk": true, "feedback": "Detailed explanation of why this clause is risky or safe, referencing FSW best practices." }] } (Title: "Risk & Compliance Audit")
                                  * CRITICAL for ai-redline:
                                  * Generate exactly 5-7 items.
                                  * 2-3 items MUST be risks (isRisk: true). Risks must be subtle, realistic operational mistakes (e.g., bypassing a safety check to save time), not cartoonish errors.
                                  * 3-4 items MUST be safe (isRisk: false).
                                  * ALWAYS provide educational 'feedback' for SAFE items (don't just say 'Correct'). The text MUST read like a real technical document.
                                - ai-debate: { "topic": "A controversial operational shortcut or policy bypass proposed by a colleague (e.g., 'Can we skip the system diagnostic this one time to save an hour?').", "persona": "A rushed, contrarian, or budget-conscious stakeholder pushing for the shortcut.", "stakeholderName": "A realistic name (e.g., Dave, Sarah)", "stances": ["Defend the Policy", "Allow the Shortcut"] } (Title: "Policy Pushback")
                                  * CRITICAL for ai-debate: The scenario MUST involve a stakeholder pushing back against FSW best practices. The user must be forced to defend the correct, safe, or compliant procedure against this stubborn persona.
                                - ai-swipe: { "title": "The Corkboard", "cards": [{ "text": "A brief, actionable scenario (Max 150 characters, e.g., 'A technician arrives without PPE but promises to just stay in the van.').", "isCorrect": true, "feedback": "Why this is the right course of action." }], "labels": { "left": "Reject", "right": "Accept" } } (Title: "The Corkboard")
                                  * CRITICAL for ai-swipe:
                                  * Generate exactly 10-12 cards.
                                  * CARDS MUST NOT BE TRUE/FALSE TRIVIA. They must be practical snapshot scenarios describing a proposed action or decision. 
                                  * It MUST fundamentally make grammatical and logical sense for the user to reply to the scenario with either "Accept" or "Reject".
                                  * NEVER use open-ended questions. NEVER use questions like "Should we do this?". Instead, write statements like "A technician offers to..." so the user can Accept or Reject the offer.
                                  * "isCorrect": true -> User should ACCEPT (Swipe Right). The action is highly compliant/safe.
                                  * "isCorrect": false -> User should REJECT (Swipe Left). The action is poor practice/dangerous.
                                  * FEEDBACK must explicitly teach the user the 'why' behind the policy.
                                `;

                    if (supportingDocs) {
                        lessonSystemPrompt += `\n\nADDITIONAL CONTEXT FROM UPLOADED DOCUMENTS:\n${supportingDocs}\n\nCRITICAL INSTRUCTION: You MUST use the information provided in the documents above to write the lesson content, audio script, and presentation input. The content MUST be factually aligned with these documents. Do not hallucinate or contradict the provided text.`;
                    }

                    const contentCompletion = await openrouter.chat.completions.create({
                        model: "openai/gpt-4o",
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

                    if (contentData.ai_component) {
                        const { type, config } = contentData.ai_component;
                        if (type === 'ai-redline') {
                            if (!config || !config.items || config.items.length < 5) {
                                throw new Error("AI-Redline component generated fewer than 5 items. Retrying for better depth...");
                            }
                        }
                    }

                    // SANITIZATION
                    if (contentData.markdown_content) {
                        contentData.markdown_content = contentData.markdown_content.replace(/\\n/g, '\n');
                    }
                    if (contentData.audio_tracks && Array.isArray(contentData.audio_tracks)) {
                        contentData.audio_tracks.forEach(track => {
                            if (track.script) track.script = track.script.replace(/\\n/g, '\n');
                        });
                    }

                    onProgress(`${progressPrefix} Generating audio & slides for "${lesson.title}"...`);

                    // Generate Gamma Presentation
                    let gammaUrl = null;
                    try {
                        gammaUrl = await createPresentation(lesson.title, contentData.presentation_input);
                    } catch (err) {
                        console.error("[AI] Gamma failed:", err);
                    }

                    // Sequential Execution for Audio to prevent rate limits
                    const generatedTracks = [];
                    if (contentData.audio_tracks && Array.isArray(contentData.audio_tracks)) {
                        for (let i = 0; i < contentData.audio_tracks.length; i++) {
                            const track = contentData.audio_tracks[i];
                            onProgress(`${progressPrefix} Generating audio track ${i + 1}/${contentData.audio_tracks.length}...`);
                            try {
                                const audioUrl = await createAudio(track.script);
                                generatedTracks.push({ title: track.title, script: track.script, url: audioUrl });
                            } catch (err) {
                                console.error(`[AI] Audio failed for track ${i}:`, err);
                                generatedTracks.push({ title: track.title, script: track.script, url: null }); // Keep track even if generation failed
                            }
                            // Small delay between calls to be safe
                            await new Promise(r => setTimeout(r, 500));
                        }
                    }

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
                    lesson.audio_tracks = generatedTracks;
                    lesson.audio_url = generatedTracks.length > 0 ? generatedTracks[0].url : null; // Fallback for backward compatibility
                    lesson.presentation_input = contentData.presentation_input;
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

            // Count user turns to determine "fatigue" state
            const userTurns = messages.filter(m => m.role === 'user').length;
            let fatigueInstructions = "";

            if (userTurns >= 5) {
                fatigueInstructions = `
                URGENT: The call is dragging on (Turn ${userTurns}).
                - The user has taken too long to resolve the issue. 
                - You MUST end the call now. State that you don't have any more time and will seek help elsewhere, say goodbye, and append [FAILED].
                `;
            } else if (userTurns >= 3) {
                fatigueInstructions = `
                NOTE: The troubleshooting is progressing (Turn ${userTurns}).
                - Be cooperative. If they provide a solution that is "good enough" or close to the objective, accept it naturally, say goodbye, and append [SUCCESS].
                - If they are completely lost or unhelpful, end the call in frustration and append [FAILED].
                `;
            }

            const completion = await openrouter.chat.completions.create({
                model: "openai/gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `${FSW_INTERNAL_CONTEXT}
                You are playing the role of a caller who is experiencing an issue in a training simulation for FSW.
                ROLE: ${scenario.role}
                ISSUE / OBJECTIVE TO BE RESOLVED BY USER: ${scenario.objective}
                SCENARIO INTRO: ${scenario.intro}
                
                CRITICAL RULES:
                1. You are strictly the character defined in ROLE. You are experiencing an issue related to the subject matter.
                2. You are NOT an AI assistant, mentor, or helpful guide. Do not act like you are testing the user. You genuinely need their help to resolve your issue.
                3. NEVER give away the solution. Let the user troubleshoot, ask questions, or provide the fix.
                4. Answer the user's questions naturally based on your role and issue, but do not volunteer information they haven't asked for if it makes it too easy.
                5. Show appropriate emotion (frustration, confusion, urgency) depending on your role.

                COMPLETION LOGIC:
                - Stay in character. 
                - Evaluate the user's responses. Have they successfully identified and resolved your issue according to the OBJECTIVE?
                - If the user has sufficiently resolved the issue, you MUST naturally conclude the conversation. Express gratitude or relief ("Thanks for sorting that out", "That makes sense now", etc.), say goodbye, and append [SUCCESS] at the very end. 
                - If the user explicitly gives up, gives dangerously incorrect advice, or is completely unhelpful, you MUST end the call in frustration or disappointment. Say goodbye and append [FAILED] at the very end.
                - DO NOT append [SUCCESS] or [FAILED] until the conversation naturally concludes or you are forced to end it.
                - DO NOT ask any further questions or request more work if you are appending [SUCCESS] or [FAILED].

                ${fatigueInstructions}
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
export const chatWithDebater = async (messages, topic, persona, pointNumber = 1, failedAttempts = 0) => {
    let instructions = `
        You are roleplaying a stubborn FSW stakeholder pushing back against a company policy.
        
        TOPIC / PROPOSED SHORTCUT: ${topic}
        YOUR PERSONA: ${persona || "A rushed, budget-conscious contractor."}
        CURRENT PUSHBACK LEVEL: ${pointNumber} of 5.
        FAILED ATTEMPTS TO CONVINCE YOU: ${failedAttempts}

        OBJECTIVE: 
        1. Evaluate the user's latest message. Are they successfully defending the policy with strong logic, or are they caving to your pressure / using weak arguments?
        2. If the user caves to your request (e.g. "Okay, we can skip it this time") or gives a very weak reason (e.g. "Because management said so"), set "advance_progress" to false, and reply in character pointing out the flaw or accepting their capitulation (which means they fail).
        3. If the user provides a strong, logical defense of the best practice, set "advance_progress" to true, and either push back from a different angle or start conceding.
        4. Provide an optional "hint" (out of character) to help them out if advance_progress is false.
        5. If CURRENT PROGRESS is 5 AND you set advance_progress to true, or if they have completely failed/given up, you MUST populate "final_feedback".
                
        RULES:
        1. KEEP IT CONCISE. Your "reply" string must be under 50 words.
        2. Stay in character based on YOUR PERSONA. Be stubborn but realistic.
        
        OUTPUT FORMAT (Return STRICT JSON):
        {
          "reply": "Your next pushback or response...",
          "advance_progress": true, // false if they caved or gave a weak argument
          "failed_state": false, // set to true ONLY if the user explicitly caves, gives up, or fails completely (this ends the simulation in a failure)
          "hint": "Optional coaching nudge if advance_progress is false. (string or null)",
          "final_feedback": null
        }
        
        ONLY if CURRENT PROGRESS is 5 and advance_progress is true, or if failed_state is true, "final_feedback" MUST be:
        {
          "score": 85, // 0-74 means fail, 75-100 means pass. (If failed_state is true, score MUST be below 75)
          "strongest_argument": "Summary of what they did well (or N/A)",
          "weakness": "Why they failed or what they could improve"
        }
    `;

    const completion = await openrouter.chat.completions.create({
        model: "openai/gpt-4o",
        response_format: { type: "json_object" },
        messages: [
            {
                role: "system",
                content: `${FSW_INTERNAL_CONTEXT}\n${instructions}`
            },
            ...messages
        ]
    });
    return JSON.parse(completion.choices[0].message.content);
};

/**
 * Analyzes tone of user draft against a specific email context
 */
export const analyzeTone = async (userText, context, incomingEmail) => {
    const completion = await openrouter.chat.completions.create({
        model: "openai/gpt-4o-mini",
        messages: [
            {
                role: "system",
                content: `${FSW_INTERNAL_CONTEXT}
                You are a Professional Communications Coach at FSW.
                
                Task: Analyze the user's reply to an email.
                Context: ${context}
                Incoming Email (that they are replying to): "${incomingEmail}"
                
                Analyze the User's Draft for:
                1. Problem Resolution (does the reply actually provide the correct steps or information to solve the sender's problem?)
                2. Professionalism (appropriate framing, no slang)
                3. Tone (confident, helpful, direct but polite)
                
                CRITICAL RULE:
                If the user DOES NOT successfully resolve the issue or provide the necessary steps, the score MUST be below 75 (e.g. 50-60). The primary goal is problem resolution. Only give a score of 75 or higher if they have solved the problem.

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
