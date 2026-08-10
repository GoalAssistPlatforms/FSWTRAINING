export default async function handler(req, res) {
  const { id } = req.query; // this is the exportId

  if (!id) {
    return res.status(400).json({ error: 'Missing export ID' });
  }

  const apiKey = process.env.GAMMA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing GAMMA_API_KEY' });
  }

  try {
    const url = `https://public-api.gamma.app/v1.0/exports/${id}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey
      }
    });
    
    if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).send(text);
    }
    
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Gamma Export GET Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
