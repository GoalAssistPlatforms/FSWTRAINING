import { supabase } from './supabase.js';

const DEFAULT_VOICE_ID = "zD0Xz72VOaxH7Rv955hb"; // FSW Voice
const VOICE_ID = DEFAULT_VOICE_ID;

/**
 * Creates audio from text using ElevenLabs API and uploads to Supabase
 * @param {string} text - The text to convert to speech
 * @returns {Promise<string>} The Public URL of the generated audio
 */
export const createAudio = async (text) => {


    try {
        console.log("Generating audio for text length:", text.length);

        const response = await fetch(`/api/elevenlabs?voiceId=${VOICE_ID}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
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
            // Throwing an error so the upstream ai.js catches it and correctly handles a failed audio generation (returning null) instead of a transient, unreachable Blob URL.
            throw new Error(`Supabase Audio Upload Failed: ${error.message}`);
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

/**
 * Creates temporary audio from text for fast chat playback without uploading
 * @param {string} text - The text to convert to speech
 * @returns {Promise<string>} The local Object URL of the generated audio
 */
export const generateChatAudio = async (text) => {


    try {
        const response = await fetch(`/api/elevenlabs?voiceId=${VOICE_ID}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
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
            throw new Error(`ElevenLabs Chat API Error: ${response.status} - ${errorText}`);
        }

        const blob = await response.blob();
        return URL.createObjectURL(blob);
    } catch (error) {
        console.error("Chat Audio Generation Failed:", error);
        return null;
    }
};
