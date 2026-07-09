export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing OPENAI_API_KEY' });
  }

  try {
    const { fileBase64, model, response_format } = req.body;
    if (!fileBase64) {
      return res.status(400).json({ error: 'Missing fileBase64 parameter' });
    }

    // Convert base64 back to Buffer
    const base64Data = fileBase64.split(',')[1] || fileBase64;
    const fileBuffer = Buffer.from(base64Data, 'base64');

    // Create a Blob from the Buffer for the standard FormData API in Node 18+
    const fileBlob = new Blob([fileBuffer], { type: 'audio/webm' });

    // Construct FormData natively
    const formData = new FormData();
    formData.append('file', fileBlob, 'walkthrough.webm');
    formData.append('model', model || 'whisper-1');
    if (response_format) {
      formData.append('response_format', response_format);
    }

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Whisper API Error response:', data);
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Whisper Proxy Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
