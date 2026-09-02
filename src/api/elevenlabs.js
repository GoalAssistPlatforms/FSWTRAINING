import { supabase } from './supabase.js';

const buildSpeechPayload = (text) => ({
    text,
    model_id: 'eleven_turbo_v2_5',
    voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        use_speaker_boost: true
    }
});

const requestSpeechBlob = async (text, voiceType) => {
    const response = await fetch(`/api/elevenlabs?voiceType=${encodeURIComponent(voiceType)}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(buildSpeechPayload(text))
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs ${voiceType} voice failed: ${response.status} - ${errorText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json') || contentType.startsWith('text/')) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs ${voiceType} voice returned ${contentType}: ${errorText}`);
    }

    const blob = await response.blob();
    if (!blob.size) {
        throw new Error(`ElevenLabs ${voiceType} voice returned empty audio`);
    }

    return blob;
};

/**
 * Creates audio from text using ElevenLabs API and uploads to Supabase
 * @param {string} text - The text to convert to speech
 * @returns {Promise<string>} The Public URL of the generated audio
 */
export const createAudio = async (text) => {
    try {
        console.log('Generating audio for text length:', text ? text.length : 0);
        const cleanedText = typeof text === 'string' ? text.replace(/myhrtoolkit/gi, 'my hr tool kit') : text;
        const blob = await requestSpeechBlob(cleanedText, 'fsw');

        const filename = `audio/lesson_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`;

        const { data, error } = await supabase.storage
            .from('course_assets')
            .upload(filename, blob, {
                contentType: 'audio/mpeg',
                upsert: false
            });

        if (error) {
            console.error('Supabase Upload Error:', error);
            throw new Error(`Supabase Audio Upload Failed: ${error.message}`);
        }

        const { data: publicData } = supabase.storage
            .from('course_assets')
            .getPublicUrl(filename);

        console.log('Audio uploaded successfully:', publicData.publicUrl);
        return publicData.publicUrl;
    } catch (error) {
        console.error('Audio Generation Failed:', error);
        return null;
    }
};

/**
 * Creates temporary audio from text for fast chat playback without uploading.
 * The dedicated chat voice is preferred when configured, but the known working
 * FSW voice is used automatically if the chat voice is unavailable.
 * @param {string} text - The text to convert to speech
 * @returns {Promise<string>} The local Object URL of the generated audio
 */
export const generateChatAudio = async (text) => {
    const cleanedText = typeof text === 'string' ? text.replace(/myhrtoolkit/gi, 'my hr tool kit').trim() : text;
    if (!cleanedText) return null;

    const failures = [];
    for (const voiceType of ['josh', 'fsw']) {
        try {
            const blob = await requestSpeechBlob(cleanedText, voiceType);
            return URL.createObjectURL(blob);
        } catch (error) {
            failures.push(error.message);
            console.warn(`Chat audio ${voiceType} voice unavailable, trying fallback if available:`, error);
        }
    }

    console.error('Chat Audio Generation Failed:', failures.join(' | '));
    return null;
};
