
import { supabase } from './supabase.js';



const GAMMA_THEME_ID = (import.meta.env && import.meta.env.VITE_GAMMA_THEME_ID) || 'gamma';

/**
 * Creates a presentation using the Gamma API
 * @param {string} topic - The main topic of the presentation
 * @param {string} detailed_input - Detailed content/outline for the presentation
 * @returns {Promise<string>} The URL of the generated presentation
 */
export const createPresentation = async (topic, detailed_input) => {


    try {
        console.log("Generating Gamma presentation for:", topic);

        // Safely ensure detailed_input is a string and fix any escaped newlines
        // Safely ensure detailed_input is a string and fix any escaped newlines
        let safeInput = typeof detailed_input === 'string' 
            ? detailed_input 
            : (detailed_input ? JSON.stringify(detailed_input, null, 2) : "");
        
        safeInput = safeInput.replace(/\\n/g, '\n');
        
        // AI Fallback: Force `---` to be on its own isolated line so Gamma detects the slide break
        safeInput = safeInput.replace(/([^\n])\s*---/g, '$1\n---\n').replace(/---\s*([^\n])/g, '\n---\n$1');

        console.log(`DEBUG: Input text length: ${safeInput.length}`);

        const requestBody = {
            inputText: safeInput.substring(0, 15000), // Increased limit to allow for more context
            format: "presentation",
            themeId: GAMMA_THEME_ID,
            numCards: 10,
            textMode: "preserve",
            cardSplit: "inputTextBreaks",
            cardOptions: {
                dimensions: "fluid"
            },
            textOptions: {
                tone: "Professional",
                amount: "medium",
                audience: "FSW Staff (UK spelling)",
                language: "en-gb"
            },
            imageOptions: {
                source: "aiGenerated",
                model: "gpt-image-2-mini"
            },
            sharingOptions: {
                externalAccess: "view",
                enableSearchEngineIndexing: false
            }
        };

        console.log("DEBUG: Gamma Request Payload:", JSON.stringify(requestBody, null, 2));

        // 1. Trigger Generation via Proxy
        // We use /api/gamma which maps to https://public-api.gamma.app/v1.0 in vite.config.js
        const response = await fetch('/api/gamma/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Gamma API Error Response:", errorText);
            throw new Error(`Gamma API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const jobId = data.generationId;
        console.log("Gamma Job ID:", jobId);

        // 2. Poll for Completion via Proxy
        let attempts = 0;
        while (attempts < 150) { // Timeout after ~5 minutes
            await new Promise(r => setTimeout(r, 2000));

            const checkResponse = await fetch(`/api/gamma/generations/${jobId}`);

            if (checkResponse.ok) {
                const checkData = await checkResponse.json();
                if (checkData.status === 'COMPLETED' || checkData.status === 'SUCCESS' || checkData.status === 'completed') {
                    // Gamma's API might return 'gammaUrl' or 'url' depending on the endpoint version,
                    // but based on docs and user scenario, we expect a URL.
                    let gammaUrl = checkData.gammaUrl || checkData.url;
                    let gammaId = checkData.gammaId;
                    if (!gammaId && gammaUrl) {
                        const match = gammaUrl.split('/');
                        gammaId = match.pop();
                    }
                    return { url: gammaUrl, id: gammaId };
                }
                if (checkData.status === 'FAILED' || checkData.status === 'failed') {
                    throw new Error("Gamma generation failed: " + JSON.stringify(checkData));
                }
            }
            attempts++;
        }

        throw new Error("Gamma generation timed out");

    } catch (error) {
        console.error("Gamma Generation Failed:", error);
        throw error;
    }
};

export const exportToPdf = async (gammaId) => {
    console.log(`Triggering export for Gamma ID: ${gammaId}`);
    try {
        const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        let exportRes;
        if (isLocalDev) {
            exportRes = await fetch(`/api/gamma/gammas/${gammaId}/export`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ exportAs: 'pdf' })
            });
        } else {
            exportRes = await fetch(`/api/gamma/export`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gammaId })
            });
        }

        if (!exportRes.ok) {
            const text = await exportRes.text();
            throw new Error(`Export API error: ${exportRes.status} - ${text}`);
        }

        const exportData = await exportRes.json();
        const exportId = exportData.exportId || exportData.id;

        if (!exportId) throw new Error("No exportId returned from API");

        // Poll for export status
        let attempts = 0;
        while (attempts < 60) { // 3 minutes timeout
            await new Promise(r => setTimeout(r, 3000));
            const pollRes = await fetch(`/api/gamma/exports/${exportId}`);
            
            if (pollRes.ok) {
                const pollData = await pollRes.json();
                if (pollData.status === 'COMPLETED' || pollData.status === 'SUCCESS' || pollData.status === 'completed') {
                    return pollData.exportUrl || pollData.url || pollData.downloadUrl;
                } else if (pollData.status === 'FAILED' || pollData.status === 'failed') {
                    throw new Error("PDF Export failed on Gamma server");
                }
            }
            attempts++;
        }
        throw new Error("Gamma PDF export timed out");
    } catch (err) {
        console.error("Gamma PDF Export Failed:", err);
        throw err;
    }
};

export const exportAndUploadPdf = async (gammaId) => {
    console.log(`Starting PDF export and upload for Gamma ID: ${gammaId}`);
    try {
        const pdfDownloadUrl = await exportToPdf(gammaId);
        if (!pdfDownloadUrl) throw new Error("No PDF URL returned from exportToPdf");

        // Use the local/production proxied route to prevent CORS errors in browser fetch
        const proxiedUrl = pdfDownloadUrl.replace('https://assets.api.gamma.app', '/api/gamma-assets');
        const pdfResponse = await fetch(proxiedUrl);
        const pdfBlob = await pdfResponse.blob();
        
        const filePath = `slides/${gammaId}.pdf`;
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('course_assets')
            .upload(filePath, pdfBlob, {
                contentType: 'application/pdf',
                upsert: true
            });

        if (uploadError) {
            throw new Error(`Failed to upload PDF to Supabase: ${uploadError.message}`);
        }
        
        const { data: publicUrlData } = supabase.storage
            .from('course_assets')
            .getPublicUrl(filePath);
            
        return publicUrlData.publicUrl;
    } catch (err) {
        console.error("exportAndUploadPdf Failed:", err);
        throw err;
    }
};


