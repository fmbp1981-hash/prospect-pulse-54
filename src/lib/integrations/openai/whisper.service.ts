/**
 * FLUXO 3 - TRANSCRIÇÃO DE ÁUDIO
 * Equivalente nativo ao node "Transcrever Áudio" (OpenAI Whisper) do n8n.
 */

import { getCurrentLlm, recordLlmUsage, type LlmUsage } from '@/lib/ai/openai-key-context';

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimetype = 'audio/ogg'
): Promise<string> {
  const { apiKey } = getCurrentLlm();

  const extension = mimetype.split('/')[1]?.split(';')[0] || 'ogg';
  const filename = `audio.${extension}`;

  const formData = new FormData();
  const blob = new Blob([audioBuffer.buffer as ArrayBuffer], { type: mimetype });
  formData.append('file', blob, filename);
  formData.append('model', 'whisper-1');
  formData.append('language', 'pt');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Whisper API error: ${response.status} ${err}`);
  }

  // whisper-1 cobra por duração; `usage` em tokens só vem nos modelos novos de transcrição.
  const data = (await response.json()) as { text: string; usage?: LlmUsage };
  await recordLlmUsage(data.usage, 'audio.transcriptions');
  return data.text;
}
