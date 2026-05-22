export default async function handler(req, res) {
  const { path } = req.query;
  const endpoint = Array.isArray(path) ? path.join('/') : path;
  
  if (!endpoint) {
    return res.status(400).json({ error: 'Missing Gamma API path' });
  }

  const apiKey = process.env.GAMMA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing GAMMA_API_KEY' });
  }

  try {
    const url = `https://public-api.gamma.app/v1.0/${endpoint}`;
    const options = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey
      }
    };
    
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      options.body = JSON.stringify(req.body);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).send(text);
    }
    
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Gamma Proxy Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
