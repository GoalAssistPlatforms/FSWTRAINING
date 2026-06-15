export default async function handler(req, res) {
  console.log("DEBUG [api/gamma/generations.js]: Received request");

  const apiKey = process.env.GAMMA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing GAMMA_API_KEY' });
  }

  try {
    const url = `https://public-api.gamma.app/v1.0/generations`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey
      },
      body: JSON.stringify(req.body)
    });
    
    if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).send(text);
    }
    
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Gamma Generations POST Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
