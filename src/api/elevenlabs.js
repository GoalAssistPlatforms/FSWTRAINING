import { supabase } from './supabase.js';

const ELEVENLABS_API_KEY = (import.meta.env && import.meta.env.VITE_ELEVENLABS_API_KEY) || (typeof process !== 'undefined' && process.env.VITE_ELEVENLABS_API_KEY);

const DEFAULT_VOICE_ID = "P4wGl87YTnsZgReoqa8D"; // Liam
const VOICE_ID = (import.meta.env && import.meta.env.VITE_ELEVENLABS_VOICE_ID) || DEFAULT_VOICE_ID;

/**
 * Creates audio from text using ElevenLabs API and uploads to Supabase
 * @param {string} text - The text to convert to speech
 * @returns {Promise<string>} The Public URL of the generated audio
 */
export const createAudio = async (text) => {
    if (!ELEVENLABS_API_KEY) {
        console.warn("VITE_ELEVENLABS_API_KEY is missing. Returning null.");
        return null;
    }

    try {
        console.log("Generating audio for text length:", text.length);

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'xi-api-key': ELEVENLABS_API_KEY
            },
            body: JSON.stringify({
                text: text,
                model_id: "eleven_turbo_v2_5",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    use_speaker_boost: true
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`ElevenLabs API Error: ${response.status} - ${errorText}`);
        }

        const blob = await response.blob();

        // Upload to Supabase Storage
        const filename = `audio/lesson_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`;

        const { data, error } = await supabase.storage
            .from('course_assets')
            .upload(filename, blob, {
                contentType: 'audio/mpeg',
                upsert: false
            });

        if (error) {
            console.error("Supabase Upload Error:", error);
            // Fallback: return local blob URL if upload fails (active for this session only)
            console.warn("Falling back to local blob URL due to upload failure.");
            return URL.createObjectURL(blob);
        }

        // Get Public URL
        const { data: publicData } = supabase.storage
            .from('course_assets')
            .getPublicUrl(filename);

        console.log("Audio uploaded successfully:", publicData.publicUrl);
        return publicData.publicUrl;

    } catch (error) {
        console.error("Audio Generation Failed:", error);
        return null;
    }
};
