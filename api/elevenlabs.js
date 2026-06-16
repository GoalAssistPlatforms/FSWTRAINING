export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { voiceId, voiceType } = req.query;

  let apiKey = process.env.ELEVENLABS_API_KEY;
  let targetVoiceId = voiceId || process.env.ELEVENLABS_VOICE_ID || "i5LC8lKW1RRBmYdwr2bP";

  if (voiceType === 'fsw') {
    apiKey = process.env.ELEVENLABS_API_KEY_FSW || process.env.ELVENLABS_API_KEY_FSW || apiKey;
    targetVoiceId = process.env.ELEVENLABS_VOICE_ID_FSW || targetVoiceId;
  }

  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing API Key' });
  }

  try {
    let requestBody = req.body;
    if (requestBody && typeof requestBody.text === 'string') {
      requestBody = {
        ...requestBody,
        text: requestBody.text.replace(/myhrtoolkit/gi, "my hr tool kit")
      };
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${targetVoiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).send(errorText);
    }

    // Return the audio stream back to the client
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    res.setHeader('Content-Type', 'audio/mpeg');
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('ElevenLabs Proxy Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
