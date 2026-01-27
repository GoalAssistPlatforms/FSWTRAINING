
import { supabase } from './supabase.js';

const GAMMA_API_KEY = (import.meta.env && import.meta.env.VITE_GAMMA_API_KEY) || (typeof process !== 'undefined' && process.env.VITE_GAMMA_API_KEY);

const GAMMA_THEME_ID = (import.meta.env && import.meta.env.VITE_GAMMA_THEME_ID) || 'gamma';

/**
 * Creates a presentation using the Gamma API
 * @param {string} topic - The main topic of the presentation
 * @param {string} detailed_input - Detailed content/outline for the presentation
 * @returns {Promise<string>} The URL of the generated presentation
 */
export const createPresentation = async (topic, detailed_input) => {
    if (!GAMMA_API_KEY) {
        console.warn("VITE_GAMMA_API_KEY is missing. Returning mock URL.");
        return "https://gamma.app/docs/mock-presentation-url"; // Fallback for dev without key
    }

    try {
        console.log("Generating Gamma presentation for:", topic);

        console.log(`DEBUG: Input text length: ${detailed_input.length}`);

        const requestBody = {
            inputText: detailed_input.substring(0, 15000), // Increased limit to allow for more context
            format: "presentation",
            themeId: GAMMA_THEME_ID,
            numCards: 10,
            textMode: "condense",
            cardSplit: "auto",
            cardOptions: {
                dimensions: "fluid"
            },
            textOptions: {
                tone: "Professional",
                amount: "medium",
                audience: "FSW Staff",
                language: "en"
            },
            imageOptions: {
                source: "aiGenerated"
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
                'Content-Type': 'application/json',
                'X-API-KEY': GAMMA_API_KEY
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
        while (attempts < 60) { // Timeout after ~2 minutes
            await new Promise(r => setTimeout(r, 2000));

            const checkResponse = await fetch(`/api/gamma/generations/${jobId}`, {
                headers: { 'X-API-KEY': GAMMA_API_KEY }
            });

            if (checkResponse.ok) {
                const checkData = await checkResponse.json();
                if (checkData.status === 'COMPLETED' || checkData.status === 'SUCCESS' || checkData.status === 'completed') {
                    // Gamma's API might return 'gammaUrl' or 'url' depending on the endpoint version,
                    // but based on docs and user scenario, we expect a URL.
                    return checkData.gammaUrl || checkData.url;
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
        return null;
    }
};


