const IMAGE_MODELS = ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1'];

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
    || /(?:do not have|does not have|not have) access to model/i.test(message);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing OPENAI_API_KEY' });
  }

  const prompt = req.body?.prompt?.trim();
  if (!prompt) {
    return res.status(400).json({ error: 'A non-empty image prompt is required' });
  }

  try {
    for (const [index, model] of IMAGE_MODELS.entries()) {
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          size: '1536x1024',
          quality: 'high',
          output_format: 'webp',
          output_compression: 90,
          n: 1
        })
      });

      const data = await response.json();
      if (response.ok) {
        res.setHeader('X-Image-Model', model);
        return res.status(200).json(data);
      }

      const hasFallback = index < IMAGE_MODELS.length - 1;
      if (!hasFallback || !isModelAccessError(response.status, data)) {
        console.error('OpenAI image generation error:', data);
        return res.status(response.status).json(data);
      }

      console.warn(`OpenAI image model ${model} is unavailable; trying the next model.`);
    }
  } catch (error) {
    console.error('OpenAI image proxy error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
