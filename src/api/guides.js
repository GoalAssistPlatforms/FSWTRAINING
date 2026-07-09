import { supabase } from './supabase.js';
import { getPlatformSettings } from './admin.js';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
const openai = {
    embeddings: {
        create: async (payload) => {
            const res = await fetch('/api/embeddings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                throw new Error(`OpenAI Proxy Error: ${res.status}`);
            }
            return res.json();
        }
    }
};

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
export async function processAndUploadGuide(file, title, description, tags = [], reviewIntervalMonths = 12, onProgress) {
    try {
        if (onProgress) onProgress("Uploading file to storage...");
        
        const { data: userAuth } = await supabase.auth.getUser();
        if (!userAuth.user) throw new Error("Not authenticated");


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
        
        let nextReviewDate = null;
        if (reviewIntervalMonths && reviewIntervalMonths > 0) {
            const d = new Date();
            d.setMonth(d.getMonth() + parseInt(reviewIntervalMonths));
            nextReviewDate = d.toISOString();
        }

        const { data: docData, error: docError } = await supabase
            .from('guide_documents')
            .insert({
                title: title || file.name,
                description,
                file_url: fileUrl,
                tags,
                review_interval_months: reviewIntervalMonths,
                next_review_date: nextReviewDate,
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

    // 1. Count Document Guides (PDFs/Links)
    const { count: docsCount, error: docsError } = await supabase
        .from('guide_documents')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', dates.periodStart.toISOString());
        
    if (docsError) throw docsError;

    // 2. Count Software Guides (timeline walkthroughs and simulations)
    const { data: coursesData, error: coursesError } = await supabase
        .from('courses')
        .select('content_json')
        .gte('created_at', dates.periodStart.toISOString());

    if (coursesError) throw coursesError;

    let coursesCount = 0;
    if (coursesData) {
        coursesData.forEach(c => {
            let content = c.content_json;
            if (typeof content === 'string') {
                try { content = JSON.parse(content); } catch (e) {}
            }
            if (content?.is_system_simulation === true || content?.type === 'video_walkthrough') {
                coursesCount++;
            }
        });
    }
    
    return {
        used: (docsCount || 0) + coursesCount,
        total: settings.max_guides_per_period,
        renewalDate: dates.nextRenewal
    };
}

/**
 * Helper: Fetches a URL via proxy, cleans HTML to extract text or metadata, and embeds it.
 */
export async function processAndUploadWebLink(url, tags = [], reviewIntervalMonths = 12, onProgress) {
    try {
        if (onProgress) onProgress("Fetching content from link...");
        
        const { data: userAuth } = await supabase.auth.getUser();
        if (!userAuth.user) throw new Error("Not authenticated");


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

        // Fetch via our own serverless proxy to avoid third-party rate limits
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
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
        
        let nextReviewDate = null;
        if (reviewIntervalMonths && reviewIntervalMonths > 0) {
            const d = new Date();
            d.setMonth(d.getMonth() + parseInt(reviewIntervalMonths));
            nextReviewDate = d.toISOString();
        }

        const { data: docData, error: docError } = await supabase
            .from('guide_documents')
            .insert({
                title: title.substring(0, 150),
                description,
                file_url: url, // For generic links, file_url holds the http link
                tags,
                review_interval_months: reviewIntervalMonths,
                next_review_date: nextReviewDate,
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
        .select('id, title, description, content_json')
        .eq('status', 'live');
        
    let interactiveGuidesContext = '';
    let interactiveSources = [];
    if (rawCourses) {
        const interactiveGuides = rawCourses.filter(c => 
            c.content_json?.is_system_simulation === true || 
            c.content_json?.type === 'video_walkthrough'
        );
        interactiveGuides.forEach((g, idx) => {
            interactiveSources.push({ 
                document_title: `Interactive Guide: ${g.title}`,
                is_interactive: true,
                courseData: g 
            });
            interactiveGuidesContext += `[Source Interactive Guide: ${g.title}]\n`;
            interactiveGuidesContext += `Description: ${g.description || 'Step-by-step guide'}\n`;
            
            const stepsList = g.content_json?.steps || g.content_json?.slides || [];
            if (stepsList.length > 0) {
                interactiveGuidesContext += `Steps:\n`;
                stepsList.forEach((step, sIdx) => {
                    interactiveGuidesContext += `Step ${sIdx + 1}: ${step.instruction || ''} - ${step.teachingText || ''}\n`;
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

    const completion = await openrouter.chat.completions.create({
        model: "openai/gpt-4o-mini", // Very fast for reading context
        messages,
        temperature: 0.2
    });

    const answerText = completion.choices[0].message.content;

    // Return all retrieved chunks as sources so the user can explore them, 
    // rather than relying on strict string matching against the AI's answer.
    return {
        answer: answerText,
        sources: matchedChunks
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

export async function updateGuideMetadata(id, updates) {
    if (updates.review_interval_months !== undefined && updates.next_review_date === undefined) {
        if (updates.review_interval_months) {
            const d = new Date();
            d.setMonth(d.getMonth() + parseInt(updates.review_interval_months));
            updates.next_review_date = d.toISOString();
        } else {
            updates.next_review_date = null;
        }
    }
    const { data, error } = await supabase
        .from('guide_documents')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function getOverdueContent() {
    const nowStr = new Date().toISOString();
    const [guidesRes, coursesRes] = await Promise.all([
        supabase.from('guide_documents').select('id, title, file_url, next_review_date, review_interval_months').lt('next_review_date', nowStr),
        supabase.from('courses').select('id, title, next_review_date, review_interval_months, status, content_json').lt('next_review_date', nowStr).neq('status', 'archived')
    ]);

    const overdueItems = [];
    if (guidesRes.data) {
        guidesRes.data.forEach(g => {
            const isLink = g.file_url && !g.file_url.includes('/storage/');
            overdueItems.push({
                id: g.id,
                title: g.title,
                type: isLink ? 'link' : 'document',
                next_review_date: g.next_review_date,
                review_interval_months: g.review_interval_months
            });
        });
    }

    if (coursesRes.data) {
        coursesRes.data.forEach(c => {
            let isGuide = false;
            try {
                const content = typeof c.content_json === 'string' ? JSON.parse(c.content_json) : c.content_json;
                isGuide = content?.is_system_simulation === true || content?.type === 'video_walkthrough';
            } catch(e) {}
            
            overdueItems.push({
                id: c.id,
                title: c.title,
                type: isGuide ? 'guide' : 'course',
                next_review_date: c.next_review_date,
                review_interval_months: c.review_interval_months
            });
        });
    }

    return overdueItems;
}

export async function snoozeContentReview(type, id, intervalMonths) {
    const d = new Date();
    d.setMonth(d.getMonth() + parseInt(intervalMonths || 12));
    const nextReviewDate = d.toISOString();

    if (type === 'course' || type === 'guide') {
        const { error } = await supabase
            .from('courses')
            .update({
                next_review_date: nextReviewDate,
                review_interval_months: intervalMonths || 12
            })
            .eq('id', id);
        if (error) throw error;
    } else {
        const { error } = await supabase
            .from('guide_documents')
            .update({
                next_review_date: nextReviewDate,
                review_interval_months: intervalMonths || 12
            })
            .eq('id', id);
        if (error) throw error;
    }
}
