export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GAMMA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing GAMMA_API_KEY' });
  }

  const { gammaId } = req.body;
  if (!gammaId) {
    return res.status(400).json({ error: 'Missing gammaId in request body' });
  }

  try {
    const url = `https://public-api.gamma.app/v1.0/gammas/${gammaId}/export`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey
      },
      body: JSON.stringify({ exportAs: 'pdf' })
    });
    
    if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).send(text);
    }
    
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Gamma Export POST Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
