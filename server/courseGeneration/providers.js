const OPENAI_IMAGE_MODELS = ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1'];
const GAMMA_BASE_URL = 'https://public-api.gamma.app/v1.0';

function requiredEnvironmentValue(name, fallbackName = null) {
    const value = process.env[name] || (fallbackName ? process.env[fallbackName] : null);
    if (!value) throw new Error(`Missing required server configuration: ${name}`);
    return value;
}

async function readProviderResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) return response.json();
    return response.text();
}

async function requestJson(url, options, providerName) {
    const response = await fetch(url, {
        ...options,
        signal: options?.signal || AbortSignal.timeout(180000)
    });
    const data = await readProviderResponse(response);
    if (!response.ok) {
        const message = typeof data === 'string'
            ? data
            : data?.error?.message || data?.error || JSON.stringify(data);
        const error = new Error(`${providerName} request failed with status ${response.status}: ${message}`);
        error.status = response.status;
        error.provider = providerName;
        throw error;
    }
    return data;
}

export async function createOpenRouterCompletion(payload) {
    const apiKey = requiredEnvironmentValue('OPENROUTER_API_KEY');
    return requestJson('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': process.env.VERCEL_PROJECT_PRODUCTION_URL
                ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
                : 'https://fswtraining.vercel.app',
            'X-Title': 'FSW Training Platform'
        },
        body: JSON.stringify(payload)
    }, 'OpenRouter');
}

export async function createEmbeddings(inputs) {
    const apiKey = requiredEnvironmentValue('OPENAI_API_KEY');
    const data = await requestJson('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: inputs
        })
    }, 'OpenAI embeddings');

    return (data.data || [])
        .sort((left, right) => left.index - right.index)
        .map(item => item.embedding);
}

function isImageModelAccessError(error) {
    return error?.status === 403
        || error?.status === 404
        || /model_not_found|invalid_model|not have access|does not have access/i.test(error?.message || '');
}

async function generateOpenAIImage(prompt) {
    const apiKey = requiredEnvironmentValue('OPENAI_API_KEY');

    for (const [index, model] of OPENAI_IMAGE_MODELS.entries()) {
        try {
            const data = await requestJson('https://api.openai.com/v1/images/generations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model,
                    prompt,
                    size: '1536x1024',
                    quality: 'high',
                    output_format: 'webp',
                    output_compression: 90,
                    n: 1
                }),
                signal: AbortSignal.timeout(180000)
            }, 'OpenAI image');

            const image = data.data?.[0];
            if (image?.b64_json) return `data:image/webp;base64,${image.b64_json}`;
            if (image?.url) return image.url;
            throw new Error('OpenAI image response did not contain image data.');
        } catch (error) {
            const hasFallback = index < OPENAI_IMAGE_MODELS.length - 1;
            if (!hasFallback || !isImageModelAccessError(error)) throw error;
        }
    }

    throw new Error('No OpenAI image model was available.');
}

async function uploadThumbnailToCloudinary(imageUrl, topic) {
    const cloudName = requiredEnvironmentValue('VITE_CLOUDINARY_CLOUD_NAME');
    const uploadPreset = requiredEnvironmentValue('VITE_CLOUDINARY_UPLOAD_PRESET');
    const formData = new FormData();
    formData.append('file', imageUrl);
    formData.append('upload_preset', uploadPreset);
    formData.append('context', `caption=${topic}`);
    formData.append('tags', `course_thumbnail,${String(topic).replace(/\s+/g, '_')}`);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(120000)
    });
    const data = await readProviderResponse(response);
    if (!response.ok || !data?.secure_url) {
        throw new Error(`Cloudinary upload failed: ${data?.error?.message || response.statusText}`);
    }
    return data.secure_url;
}

export async function generateThumbnailAsset(topic) {
    let visualSubject = topic;
    try {
        const completion = await createOpenRouterCompletion({
            model: 'openai/gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `Convert the course topic into one concrete physical object that represents it metaphorically. Return only the visual description. Do not include people, faces, limbs, writing, or logos. The object must suit a clean flat vector illustration.`
                },
                { role: 'user', content: `Topic: ${topic}` }
            ]
        });
        visualSubject = completion.choices?.[0]?.message?.content?.trim() || topic;
    } catch (error) {
        console.warn('Thumbnail visual description failed, using the topic.', error);
    }

    const prompt = `A beautifully clean, modern, flat two dimensional vector graphic illustration of ${visualSubject}. Premium corporate minimalist design using the FSW navy blue, bright blue, green, and white palette. Solid colours, crisp clean lines, no shading, no photorealism, no three dimensional rendering, no people, and no text.`;
    const temporaryImage = await generateOpenAIImage(prompt);
    return uploadThumbnailToCloudinary(temporaryImage, topic);
}

function gammaHeaders() {
    return {
        'Content-Type': 'application/json',
        'X-API-KEY': requiredEnvironmentValue('GAMMA_API_KEY')
    };
}

export async function startGammaPresentation(topic, detailedInput) {
    let safeInput = typeof detailedInput === 'string'
        ? detailedInput
        : detailedInput ? JSON.stringify(detailedInput, null, 2) : '';
    safeInput = safeInput
        .replace(/\\n/g, '\n')
        .replace(/([^\n])\s*---/g, '$1\n---\n')
        .replace(/---\s*([^\n])/g, '\n---\n$1');

    return requestJson(`${GAMMA_BASE_URL}/generations`, {
        method: 'POST',
        headers: gammaHeaders(),
        body: JSON.stringify({
            inputText: safeInput.substring(0, 15000),
            format: 'presentation',
            themeId: process.env.VITE_GAMMA_THEME_ID || 'gamma',
            numCards: 10,
            textMode: 'preserve',
            cardSplit: 'inputTextBreaks',
            cardOptions: { dimensions: 'fluid' },
            textOptions: {
                tone: 'Professional',
                amount: 'medium',
                audience: 'FSW Staff using UK spelling',
                language: 'en-gb'
            },
            imageOptions: {
                source: 'aiGenerated',
                model: 'gpt-image-2-mini'
            },
            sharingOptions: {
                externalAccess: 'view',
                enableSearchEngineIndexing: false
            }
        })
    }, 'Gamma generation');
}

export async function getGammaGeneration(generationId) {
    return requestJson(`${GAMMA_BASE_URL}/generations/${encodeURIComponent(generationId)}`, {
        method: 'GET',
        headers: gammaHeaders()
    }, 'Gamma generation status');
}

export async function startGammaExport(gammaId) {
    return requestJson(`${GAMMA_BASE_URL}/gammas/${encodeURIComponent(gammaId)}/export`, {
        method: 'POST',
        headers: gammaHeaders(),
        body: JSON.stringify({ exportAs: 'pdf' })
    }, 'Gamma export');
}

export async function getGammaExport(exportId) {
    return requestJson(`${GAMMA_BASE_URL}/exports/${encodeURIComponent(exportId)}`, {
        method: 'GET',
        headers: gammaHeaders()
    }, 'Gamma export status');
}

export async function downloadGammaPdf(downloadUrl) {
    const response = await fetch(downloadUrl, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Gamma PDF download failed with status ${response.status}.`);
    return Buffer.from(await response.arrayBuffer());
}

export async function generateNarrationAudio(text) {
    const apiKey = process.env.ELEVENLABS_API_KEY_FSW
        || process.env.ELVENLABS_API_KEY_FSW
        || requiredEnvironmentValue('ELEVENLABS_API_KEY');
    const voiceId = process.env.ELEVENLABS_VOICE_ID_FSW
        || process.env.ELEVENLABS_VOICE_ID
        || 'i5LC8lKW1RRBmYdwr2bP';
    const cleanedText = String(text || '').replace(/myhrtoolkit/gi, 'my hr tool kit');

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey
        },
        body: JSON.stringify({
            text: cleanedText,
            model_id: 'eleven_turbo_v2_5',
            voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
                use_speaker_boost: true
            }
        }),
        signal: AbortSignal.timeout(180000)
    });

    if (!response.ok) {
        throw new Error(`ElevenLabs request failed with status ${response.status}: ${await response.text()}`);
    }
    return Buffer.from(await response.arrayBuffer());
}
