import { supabase } from './supabase.js';
import { getPlatformSettings } from './admin.js';
import OpenAI from 'openai';
import * as pdfjsLib from 'pdfjs-dist';

// Import the worker locally using Vite's URL resolution
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: import.meta.env.VITE_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true // Allowed for this prototype architecture
});

/**
 * Parses text from a PDF file
 */
export async function extractTextFromPDF(fileUrl) {
    const loadingTask = pdfjsLib.getDocument(fileUrl);
    const pdf = await loadingTask.promise;
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n\n';
    }
    
    return fullText;
}

/**
 * Splits text into paragraphs/chunks
 */
function chunkText(text, maxWords = 200) {
    const chunks = [];
    const paragraphs = text.split(/\n\s*\n/);
    
    let currentChunk = '';
    
    for (const p of paragraphs) {
        if (p.trim() === '') continue;
        
        const wordCount = p.split(/\s+/).length;
        const currentCount = currentChunk.split(/\s+/).length;
        
        if (currentCount + wordCount <= maxWords) {
            currentChunk += (currentChunk ? '\n\n' : '') + p.trim();
        } else {
            if (currentChunk) chunks.push(currentChunk);
            // If a single paragraph is larger than maxWords, we just push it as its own chunk
            currentChunk = p.trim();
        }
    }
    
    if (currentChunk) {
        chunks.push(currentChunk);
    }
    
    return chunks;
}

/**
 * Uses OpenAI to get an embedding vector for a string of text
 */
export async function generateEmbedding(text) {
    const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
    });
    return response.data[0].embedding;
}

/**
 * Perform a background similarity search to extract relevant company documentation chunks
 */
export async function searchCompanyContext(queryText, limit = 5) {
    try {
        const queryEmbedding = await generateEmbedding(queryText);
        const { data: matchedChunks, error } = await supabase.rpc('match_guide_chunks', {
            query_embedding: queryEmbedding,
            match_threshold: 0.25,
            match_count: limit
        });
        
        if (error) throw error;
        if (!matchedChunks || matchedChunks.length === 0) return "";
        
        return matchedChunks.map((c, i) => `[From Company Guide: ${c.document_title}]\n${c.content}`).join('\n\n');
    } catch (err) {
        console.error("Vector search failed:", err);
        return ""; // Fail gracefully and return no context
    }
}

/**
 * Helper: Uploads PDF, Extracts it, Embeds it, and saves to DB.
 */
export async function processAndUploadGuide(file, title, description, tags = [], onProgress) {
    try {
        if (onProgress) onProgress("Uploading file to storage...");
        
        const { data: userAuth } = await supabase.auth.getUser();
        if (!userAuth.user) throw new Error("Not authenticated");

        // Check limits if user is a manager
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', userAuth.user.id).single();
        if (profile?.role === 'manager') {
            const { getPlatformSettings, getBillingPeriodDates } = await import('./admin.js');
            const settings = await getPlatformSettings();
            if (settings) {
                const dates = getBillingPeriodDates(settings.subscription_start_date, settings.renewal_period_months);
                if (dates) {
                    const { count, error: countError } = await supabase
                        .from('guide_documents')
                        .select('*', { count: 'exact', head: true })
                        .gte('created_at', dates.periodStart.toISOString());
                        
                    if (countError) throw countError;
                    
                    if (count >= settings.max_guides_per_period) {
                        throw new Error(`Limit Reached: You have created ${count} guides in the current billing period, which is your maximum limit. Please contact your administrator to upgrade your plan.`);
                    }
                }
            }
        }

        // 1. Upload to Supabase Storage (assuming a 'guides' bucket exists, if not we'll create it)
        const fileName = `${Date.now()}_${file.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('guides')
            .upload(fileName, file);
            
        if (uploadError) throw uploadError;
        
        const { data: publicUrlData } = supabase.storage
            .from('guides')
            .getPublicUrl(fileName);
        
        const fileUrl = publicUrlData.publicUrl;

        // 2. Read PDF text
        if (onProgress) onProgress("Extracting text from PDF...");
        const fileUrlForPdfJs = URL.createObjectURL(file); // Use local blob for faster parsing
        const rawText = await extractTextFromPDF(fileUrlForPdfJs);
        if (!rawText || rawText.trim() === '') throw new Error("No readable text found in PDF");

        // 3. Create document record
        if (onProgress) onProgress("Creating database record...");
        const { data: docData, error: docError } = await supabase
            .from('guide_documents')
            .insert({
                title: title || file.name,
                description,
                file_url: fileUrl,
                tags,
                created_by: userAuth.user.id
            })
            .select()
            .single();
            
        if (docError) throw docError;

        // 4. Chunk text and create embeddings
        if (onProgress) onProgress("Analyzing content with AI...");
        const chunks = chunkText(rawText);
        
        const totalChunks = chunks.length;
        let pidx = 0;
        
        for (const chunk of chunks) {
            pidx++;
            if (onProgress) onProgress(`Generating AI embeddings (${pidx}/${totalChunks})...`);
            
            const embedding = await generateEmbedding(chunk);
            
            await supabase
                .from('guide_chunks')
                .insert({
                    document_id: docData.id,
                    content: chunk,
                    embedding,
                    chunk_index: pidx
                });
        }

        if (onProgress) onProgress("Complete!");
        return docData;

    } catch (error) {
        console.error("Guide Processing Error:", error);
        throw error;
    }
}



export const getGuideUsageStats = async () => {
    const { getPlatformSettings, getBillingPeriodDates } = await import('./admin.js');
    const settings = await getPlatformSettings();
    if (!settings) return null;
    const dates = getBillingPeriodDates(settings.subscription_start_date, settings.renewal_period_months);
    if (!dates) return null;

    const { count, error } = await supabase
        .from('knowledge_base')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', dates.periodStart.toISOString());
        
    if (error) throw error;
    
    return {
        used: count || 0,
        total: settings.max_guides_per_period,
        renewalDate: dates.nextRenewal
    };
}

/**
 * Helper: Fetches a URL via proxy, cleans HTML to extract text or metadata, and embeds it.
 */
export async function processAndUploadWebLink(url, tags = [], onProgress) {
    try {
        if (onProgress) onProgress("Fetching content from link...");
        
        const { data: userAuth } = await supabase.auth.getUser();
        if (!userAuth.user) throw new Error("Not authenticated");

        // Check limits if user is a manager
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', userAuth.user.id).single();
        if (profile?.role === 'manager') {
            const { getPlatformSettings, getBillingPeriodDates } = await import('./admin.js');
            const settings = await getPlatformSettings();
            if (settings) {
                const dates = getBillingPeriodDates(settings.subscription_start_date, settings.renewal_period_months);
                if (dates) {
                    const { count, error: countError } = await supabase
                        .from('guide_documents')
                        .select('*', { count: 'exact', head: true })
                        .gte('created_at', dates.periodStart.toISOString());
                        
                    if (countError) throw countError;
                    
                    if (count >= settings.max_guides_per_period) {
                        throw new Error(`Limit Reached: You have created ${count} guides in the current billing period, which is your maximum limit. Please contact your administrator to upgrade your plan.`);
                    }
                }
            }
        }

        // --- Deduplication Check ---
        // If the URL already exists in the database, safely skip it.
        const { data: existingDoc } = await supabase
            .from('guide_documents')
            .select('id')
            .eq('file_url', url)
            .maybeSingle();

        if (existingDoc) {
            if (onProgress) onProgress("Link already exists, skipping...");
            return { skipped: true, doc: existingDoc };
        }

        // Fetch via open cors proxy (api.codetabs.com is much more reliable)
        const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error("Failed to fetch link");
        
        const htmlString = await response.text();
        
        if (!htmlString) throw new Error("No readable content returned from URL");

        if (onProgress) onProgress("Extracting text from website...");
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');
        
        // YouTube specific parsing using oEmbed
        let title = doc.title || url;
        let description = "Web Resource";
        let rawText = "";

        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            description = "YouTube Video";
            try {
                if (onProgress) onProgress("Fetching YouTube metadata...");
                const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
                const oRes = await fetch(oembedUrl);
                if (oRes.ok) {
                    const ytData = await oRes.json();
                    title = ytData.title || title;
                    rawText = `Video Title: ${ytData.title}\nChannel: ${ytData.author_name}\nDescription: This is a YouTube Video reference training material. Please advise the user to click the link to watch this video.`;
                }
            } catch (e) {
                console.error("YouTube oEmbed failed", e);
            }
        } else {
            // Remove known non-content tags
            doc.querySelectorAll('script, style, nav, footer, iframe, img, svg, header').forEach(el => el.remove());
            const bodyText = doc.body ? doc.body.innerText.replace(/\s+/g, ' ').trim() : '';
            if (bodyText) {
                rawText = document.body ? bodyText : '';
            }
        }
        
        // Ensure there is something to embed
        if (!rawText || rawText.trim().length < 10) {
            // fallback to title
            rawText = title + " \n " + description; 
        }

        if (onProgress) onProgress("Creating database record...");
        const { data: docData, error: docError } = await supabase
            .from('guide_documents')
            .insert({
                title: title.substring(0, 150),
                description,
                file_url: url, // For generic links, file_url holds the http link
                tags,
                created_by: userAuth.user.id
            })
            .select()
            .single();
            
        if (docError) throw docError;

        if (onProgress) onProgress("Analyzing content with AI...");
        const chunks = chunkText(rawText);
        
        const totalChunks = chunks.length;
        let pidx = 0;
        
        for (const chunk of chunks) {
            pidx++;
            if (onProgress) onProgress(`Generating AI embeddings (${pidx}/${totalChunks})...`);
            
            const embedding = await generateEmbedding(chunk);
            
            await supabase
                .from('guide_chunks')
                .insert({
                    document_id: docData.id,
                    content: chunk,
                    embedding,
                    chunk_index: pidx
                });
        }

        if (onProgress) onProgress("Complete!");
        return docData;

    } catch (error) {
        console.error("Web Link Processing Error:", error);
        throw error;
    }
}


/**
 * Searches the Knowledge Base and answers a question using Context
 */
export async function chatWithGuides(userQuestion, conversationHistory = []) {
    // 1. Convert question to vector
    const questionEmbedding = await generateEmbedding(userQuestion);
    
    // 2. Search database for matches
    const { data: matchedChunks, error: searchError } = await supabase.rpc('match_guide_chunks', {
        query_embedding: questionEmbedding,
        match_threshold: 0.3, // Similarity threshold (0 to 1)
        match_count: 5 // Top 5 relevant paragraphs
    });
    
    if (searchError) {
        console.error("Search error", searchError);
        throw new Error("Failed to search knowledge base.");
    }
    
    // 2.5 Query all Interactive Guides (we inject these fully since they are short step-by-steps)
    const { data: rawCourses } = await supabase
        .from('courses')
        .select('title, description, content_json')
        .eq('status', 'live');
        
    let interactiveGuidesContext = '';
    let interactiveSources = [];
    if (rawCourses) {
        const interactiveGuides = rawCourses.filter(c => c.content_json?.is_system_simulation === true);
        interactiveGuides.forEach((g, idx) => {
            interactiveSources.push({ 
                document_title: `Interactive Guide: ${g.title}`,
                is_interactive: true,
                courseData: g 
            });
            interactiveGuidesContext += `[Source Interactive Guide: ${g.title}]\n`;
            interactiveGuidesContext += `Description: ${g.description || 'Step-by-step guide'}\n`;
            if (g.content_json.slides) {
                interactiveGuidesContext += `Steps:\n`;
                g.content_json.slides.forEach((slide, sIdx) => {
                    interactiveGuidesContext += `Step ${sIdx + 1}: ${slide.instruction || ''} - ${slide.teachingText || ''}\n`;
                });
            }
            interactiveGuidesContext += `\n`;
        });
    }

    // 3. Construct Context String
    let contextStr = matchedChunks.map((chunk, i) => `[Source ${i+1}: ${chunk.document_title}]\n${chunk.content}`).join('\n\n');
    if (interactiveGuidesContext) {
        contextStr += `\n\n=== INTERACTIVE GUIDES SYSTEM KNOWLEDGE ===\n\n${interactiveGuidesContext}`;
        // We push interactive guides into matchedChunks so they appear in sources in the UI
        interactiveSources.forEach(src => matchedChunks.push(src));
    }
    
    // 4. Prompt AI
    const systemPrompt = `You are a helpful, professional "team member" digital assistant for the company. 
Your primary job is to answer employee questions using ONLY the provided company handbook/guide context below.

CONTEXT:
${contextStr}

INSTRUCTIONS:
1. Answer the user's question politely and concisely based *only* on the provided context.
2. Do not use outside knowledge. If the answer is not in the context, say so gracefully. 
3. Cite your sources by naming the document (e.g. "According to the [Document Name]...").
4. Keep a friendly, helpful, professional tone. Formatted in clear Markdown.`;

    const messages = [
        { role: 'system', content: systemPrompt }
    ];
    
    // Optional: inject past chat messages here if you want multi-turn memory
    
    messages.push({ role: 'user', content: userQuestion });

    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Very fast for reading context
        messages,
        temperature: 0.2
    });

    const answerText = completion.choices[0].message.content;

    // Filter to only include sources that the AI actually found relevant and cited
    const relevantSources = matchedChunks.filter(chunk => {
        const title = chunk.is_interactive ? chunk.courseData.title : chunk.document_title;
        return answerText.includes(title);
    });

    return {
        answer: answerText,
        sources: relevantSources
    };
}

export async function fetchAllGuides() {
    const { data, error } = await supabase
        .from('guide_documents')
        .select('*')
        .order('created_at', { ascending: false });
        
    if (error) throw error;
    return data;
}

export async function deleteGuide(id) {
    const { error } = await supabase
        .from('guide_documents')
        .delete()
        .eq('id', id);
        
    if (error) throw error;
}

export async function fetchSystemTags() {
    // Fetch unique tags from guide_documents and courses
    const [guidesRes, coursesRes] = await Promise.all([
        supabase.from('guide_documents').select('tags'),
        supabase.from('courses').select('tags')
    ]);

    const allTags = new Set();
    
    if (guidesRes.data) {
        guidesRes.data.forEach(g => {
            if (g.tags && Array.isArray(g.tags)) {
                g.tags.forEach(t => allTags.add(t));
            }
        });
    }

    if (coursesRes.data) {
        coursesRes.data.forEach(c => {
            if (c.tags && Array.isArray(c.tags)) {
                c.tags.forEach(t => allTags.add(t));
            }
        });
    }

    return Array.from(allTags).sort();
}
