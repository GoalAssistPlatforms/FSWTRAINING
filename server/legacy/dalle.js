const IMAGE_MODELS = [
  'openai/gpt-image-2',
  'openai/gpt-image-1',
  'openai/gpt-image-1-mini'
];

export const config = {
  maxDuration: 180
};

function isModelAccessError(status, data) {
  const code = data?.error?.code;
  const message = data?.error?.message || '';

  return status === 403
    || status === 404
    || code === 'model_not_found'
    || code === 'invalid_model'
    || /(?:do not have|does not have|not have|no endpoints found) access?/i.test(message);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing OPENROUTER_API_KEY' });
  }

  const prompt = req.body?.prompt?.trim();
  if (!prompt) {
    return res.status(400).json({ error: 'A non-empty image prompt is required' });
  }

  try {
    for (const [index, model] of IMAGE_MODELS.entries()) {
      const response = await fetch('https://openrouter.ai/api/v1/images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': req.headers?.['http-referer'] || req.headers?.origin || 'http://localhost:5173',
          'X-Title': 'FSW Training Platform'
        },
        body: JSON.stringify({
          model,
          prompt,
          aspect_ratio: '3:2',
          quality: 'high',
          output_format: 'webp',
          n: 1
        })
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        res.setHeader('X-Image-Model', model);
        return res.status(200).json(data);
      }

      const hasFallback = index < IMAGE_MODELS.length - 1;
      if (!hasFallback || !isModelAccessError(response.status, data)) {
        console.error('OpenRouter image generation error:', response.status, data?.error || data);
        return res.status(response.status).json(data);
      }

      console.warn(`OpenRouter image model ${model} is unavailable; trying the next model.`);
    }
  } catch (error) {
    console.error('OpenRouter image proxy error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
