/**
 * FLUXO 3 - ANÁLISE DE PDF / DOCUMENTO
 * Equivalente nativo aos nodes "Extract from File" + "Analise Doc" do n8n.
 * Extrai texto de PDF e resume usando GPT.
 */

import { getCurrentOpenAIKey } from '@/lib/ai/openai-key-context';

export async function analyzePdf(pdfBuffer: Buffer): Promise<string> {
  const OPENAI_API_KEY = getCurrentOpenAIKey();
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');

  const base64 = pdfBuffer.toString('base64');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
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
              text: 'Extraia e resuma o conteúdo principal deste documento PDF em português, de forma objetiva e relevante para um contexto comercial.',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:application/pdf;base64,${base64}`,
                detail: 'low',
              },
            },
          ],
        },
      ],
      max_tokens: 800,
    }),
  });

  if (!response.ok) {
    // Fallback: retorna mensagem genérica se análise falhar
    console.warn('[PdfAnalyzer] Failed to analyze PDF, returning placeholder');
    return '[Documento recebido — não foi possível extrair o conteúdo automaticamente]';
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  return (
    data.choices[0]?.message?.content ??
    '[Conteúdo do documento não disponível]'
  );
}
