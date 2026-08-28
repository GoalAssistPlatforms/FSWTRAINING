export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing OPENROUTER_API_KEY' });
  }

  const model = req.body?.model?.startsWith('openai/')
    ? req.body.model
    : `openai/${req.body?.model || 'text-embedding-3-small'}`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': req.headers['http-referer'] || req.headers.origin || 'http://localhost:5173',
        'X-Title': 'FSW Training Platform'
      },
      body: JSON.stringify({
        ...req.body,
        model,
        dimensions: req.body?.dimensions || 1536
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('OpenRouter embeddings error:', response.status, data?.error || data);
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('OpenRouter embeddings proxy error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
