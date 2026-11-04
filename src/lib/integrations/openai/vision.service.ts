/**
 * FLUXO 3 - ANÁLISE DE IMAGEM
 * Equivalente nativo ao node "Analise Imagem" (GPT-4 Vision) do n8n.
 */

import { getCurrentLlm, recordLlmUsage, type LlmUsage } from '@/lib/ai/openai-key-context';

export async function analyzeImage(
  imageBuffer: Buffer,
  mimetype = 'image/jpeg'
): Promise<string> {
  const { apiKey } = getCurrentLlm();

  const base64 = imageBuffer.toString('base64');
  const dataUrl = `data:${mimetype};base64,${base64}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Descreva esta imagem em português de forma objetiva e clara, focando no conteúdo relevante para um atendimento comercial.',
            },
            {
              type: 'image_url',
              image_url: { url: dataUrl, detail: 'low' },
            },
          ],
        },
      ],
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Vision API error: ${response.status} ${err}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: LlmUsage;
  };
  await recordLlmUsage(data.usage, 'vision');

  return data.choices[0]?.message?.content ?? '[Não foi possível analisar a imagem]';
}
