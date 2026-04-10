import { supabase } from './supabase.js';
import OpenAI from 'openai';
import * as pdfjsLib from 'pdfjs-dist';

// Define the worker script source for pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.mjs`;

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
