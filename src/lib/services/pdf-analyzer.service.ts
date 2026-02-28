/**
 * FLUXO 3 - ANÁLISE DE PDF / DOCUMENTO
 * Equivalente nativo aos nodes "Extract from File" + "Analise Doc" do n8n.
 *
 * Fluxo:
 * 1. Extrai texto do PDF com pdf-parse (Node.js nativo)
 * 2. Envia o texto extraído para GPT-4o-mini para resumo comercial
 * 3. Fallback: retorna o texto bruto se o GPT falhar
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string; numpages: number }>;
import { getCurrentOpenAIKey } from '@/lib/ai/openai-key-context';

const MAX_CHARS_TO_GPT = 8000; // Limita o texto enviado ao GPT (~2k tokens)

export async function analyzePdf(pdfBuffer: Buffer): Promise<string> {
  // 1. Extrai texto do PDF
  let extractedText = '';
  try {
    const parsed = await pdfParse(pdfBuffer);
    extractedText = parsed.text?.trim() || '';
  } catch (err) {
    console.warn('[PdfAnalyzer] pdf-parse falhou ao extrair texto:', err);
  }

  if (!extractedText) {
    return '[Documento recebido — não foi possível extrair o conteúdo]';
  }

  // Trunca para não estourar tokens
  const textToSend = extractedText.length > MAX_CHARS_TO_GPT
    ? extractedText.slice(0, MAX_CHARS_TO_GPT) + '\n[... documento truncado]'
    : extractedText;

  // 2. Resume com GPT
  const OPENAI_API_KEY = getCurrentOpenAIKey();
  if (!OPENAI_API_KEY) {
    // Sem chave OpenAI: retorna o texto bruto resumido
    return `[DOCUMENTO]: ${extractedText.slice(0, 500)}`;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Você é um assistente que resume documentos PDF de forma objetiva e concisa para um contexto de atendimento comercial. Extraia as informações mais relevantes em no máximo 3 parágrafos curtos.',
          },
          {
            role: 'user',
            content: `Resuma o seguinte conteúdo extraído de um documento:\n\n${textToSend}`,
          },
        ],
        max_tokens: 600,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.warn('[PdfAnalyzer] GPT falhou, retornando texto bruto');
      return `[DOCUMENTO]: ${extractedText.slice(0, 500)}`;
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    return data.choices[0]?.message?.content ?? `[DOCUMENTO]: ${extractedText.slice(0, 500)}`;
  } catch (err) {
    console.warn('[PdfAnalyzer] Erro ao chamar GPT:', err);
    return `[DOCUMENTO]: ${extractedText.slice(0, 500)}`;
  }
}
