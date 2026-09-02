const DEFAULT_VOICE_ID = 'i5LC8lKW1RRBmYdwr2bP';

const getVoiceConfiguration = (voiceType, explicitVoiceId) => {
  const defaultApiKey = process.env.ELEVENLABS_API_KEY;
  const defaultVoiceId = process.env.ELEVENLABS_VOICE_ID;
  const fswApiKey = process.env.ELEVENLABS_API_KEY_FSW || process.env.ELVENLABS_API_KEY_FSW;
  const fswVoiceId = process.env.ELEVENLABS_VOICE_ID_FSW;
  const joshApiKey = process.env.ELEVENLABS_API_KEY_JOSH;
  const joshVoiceId = process.env.ELEVENLABS_VOICE_ID_JOSH;

  if (voiceType === 'fsw') {
    return {
      apiKey: fswApiKey || defaultApiKey || joshApiKey,
      voiceId: explicitVoiceId || fswVoiceId || defaultVoiceId || joshVoiceId || DEFAULT_VOICE_ID
    };
  }

  if (voiceType === 'josh') {
    return {
      apiKey: joshApiKey || defaultApiKey || fswApiKey,
      voiceId: explicitVoiceId || joshVoiceId || defaultVoiceId || fswVoiceId || DEFAULT_VOICE_ID
    };
  }

  return {
    apiKey: defaultApiKey || fswApiKey || joshApiKey,
    voiceId: explicitVoiceId || defaultVoiceId || fswVoiceId || joshVoiceId || DEFAULT_VOICE_ID
  };
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { voiceId, voiceType } = req.query;
  const configuration = getVoiceConfiguration(voiceType, voiceId);

  if (!configuration.apiKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing ElevenLabs API key' });
  }

  try {
    let requestBody = req.body;
    if (requestBody && typeof requestBody.text === 'string') {
      requestBody = {
        ...requestBody,
        text: requestBody.text.replace(/myhrtoolkit/gi, 'my hr tool kit')
      };
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${configuration.voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': configuration.apiKey
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).send(errorText);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!buffer.length) {
      return res.status(502).json({ error: 'ElevenLabs returned empty audio' });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('ElevenLabs Proxy Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
