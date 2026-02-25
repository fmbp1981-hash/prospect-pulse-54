/**
 * FLUXO 3 - TRANSCRIÇÃO DE ÁUDIO
 * Equivalente nativo ao node "Transcrever Áudio" (OpenAI Whisper) do n8n.
 */

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimetype = 'audio/ogg'
): Promise<string> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');

  const extension = mimetype.split('/')[1]?.split(';')[0] || 'ogg';
  const filename = `audio.${extension}`;

  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: mimetype });
  formData.append('file', blob, filename);
  formData.append('model', 'whisper-1');
  formData.append('language', 'pt');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Whisper API error: ${response.status} ${err}`);
  }

  const data = (await response.json()) as { text: string };
  return data.text;
}
