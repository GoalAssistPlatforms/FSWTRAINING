export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const providers = [];
  if (process.env.OPENROUTER_API_KEY) {
    providers.push({
      name: 'OpenRouter',
      endpoint: 'https://openrouter.ai/api/v1/embeddings',
      apiKey: process.env.OPENROUTER_API_KEY,
      model: req.body?.model?.startsWith('openai/')
        ? req.body.model
        : `openai/${req.body?.model || 'text-embedding-3-small'}`,
      headers: {
        'HTTP-Referer': req.headers['http-referer'] || req.headers.origin || 'http://localhost:5173',
        'X-Title': 'FSW Training Platform'
      }
    });
  }

  if (process.env.OPENAI_API_KEY) {
    providers.push({
      name: 'OpenAI',
      endpoint: 'https://api.openai.com/v1/embeddings',
      apiKey: process.env.OPENAI_API_KEY,
      model: req.body?.model?.replace(/^openai\//, '') || 'text-embedding-3-small',
      headers: {}
    });
  }

  if (providers.length === 0) {
    return res.status(500).json({ error: 'Server configuration error: Missing embedding API key' });
  }

  let lastStatus = 500;
  let lastError = { error: 'Embedding request failed' };

  for (const provider of providers) {
    try {
      const response = await fetch(provider.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`,
          ...provider.headers
        },
        body: JSON.stringify({
          ...req.body,
          model: provider.model
        })
      });

      const data = await response.json();
      if (response.ok) {
        return res.status(200).json(data);
      }

      lastStatus = response.status;
      lastError = data;
      console.error(`${provider.name} embeddings error:`, response.status, data?.error || data);
    } catch (error) {
      lastStatus = 500;
      lastError = { error: `${provider.name} embeddings request failed` };
      console.error(`${provider.name} embeddings proxy error:`, error);
    }
  }

  return res.status(lastStatus).json(lastError);
}
