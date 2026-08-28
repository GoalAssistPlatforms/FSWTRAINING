export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;

  if (!openRouterKey && !openAiKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing embedding API key' });
  }

  const useOpenRouter = Boolean(openRouterKey);
  const endpoint = useOpenRouter
    ? 'https://openrouter.ai/api/v1/embeddings'
    : 'https://api.openai.com/v1/embeddings';
  const apiKey = useOpenRouter ? openRouterKey : openAiKey;

  const body = {
    ...req.body,
    model: useOpenRouter
      ? (req.body?.model?.startsWith('openai/') ? req.body.model : `openai/${req.body?.model || 'text-embedding-3-small'}`)
      : (req.body?.model?.replace(/^openai\//, '') || 'text-embedding-3-small')
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...(useOpenRouter ? {
          'HTTP-Referer': req.headers['http-referer'] || req.headers.origin || 'http://localhost:5173',
          'X-Title': 'FSW Training Platform'
        } : {})
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Embeddings provider error:', response.status, data?.error || data);
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Embeddings Proxy Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
