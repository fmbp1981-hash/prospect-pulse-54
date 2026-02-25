/**
 * FLUXO 3B - HUMANIZADOR DE RESPOSTA
 * Equivalente nativo ao node "Humanizador" (Chain LLM, GPT-4.1-mini) do n8n.
 * Divide a resposta do agente em mensagens menores e mais naturais (≤ 240 chars).
 */

const OPENAI_API_KEY = () => process.env.OPENAI_API_KEY!;
const HUMANIZER_MODEL = 'gpt-4.1-mini';
const MAX_CHARS_PER_MESSAGE = 240;

/**
 * Divide resposta do agente em partes naturais para envio via WhatsApp.
 * Equivalente ao node "Humanizador" + "Split Out" do n8n.
 */
export async function humanizeResponse(response: string): Promise<string[]> {
  if (!response.trim()) return [];

  // Se a resposta já é curta o suficiente, retorna direto
  if (response.length <= MAX_CHARS_PER_MESSAGE) {
    return [response.trim()];
  }

  try {
    const result = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: HUMANIZER_MODEL,
        messages: [
          {
            role: 'system',
            content: `Você é um assistente que divide textos em múltiplas mensagens de WhatsApp.

Regras:
1. Máximo ${MAX_CHARS_PER_MESSAGE} caracteres por mensagem
2. Quebras em pontos naturais de parágrafo ou pontuação
3. Cada mensagem deve ser completa e ter sentido sozinha
4. Retorne APENAS um JSON válido: {"messages": ["msg1", "msg2", ...]}
5. Preserve emojis e formatação
6. Máximo 4 mensagens no total`,
          },
          {
            role: 'user',
            content: `Divida este texto em mensagens de WhatsApp:\n\n${response}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!result.ok) throw new Error(`Humanizer API error: ${result.status}`);

    const data = (await result.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const parsed = JSON.parse(data.choices[0].message.content) as {
      messages: string[];
    };

    if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
      return parsed.messages.filter((m) => m.trim().length > 0);
    }
  } catch (err) {
    console.warn('[Humanizer] Failed to humanize, using fallback split:', err);
  }

  // Fallback: split simples por parágrafo
  return splitByParagraph(response);
}

function splitByParagraph(text: string): string[] {
  const parts = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const result: string[] = [];

  for (const part of parts) {
    if (part.length <= MAX_CHARS_PER_MESSAGE) {
      result.push(part);
    } else {
      // Split por sentença se ainda muito longo
      const sentences = part.split(/(?<=[.!?])\s+/);
      let current = '';

      for (const sentence of sentences) {
        if ((current + ' ' + sentence).trim().length <= MAX_CHARS_PER_MESSAGE) {
          current = (current + ' ' + sentence).trim();
        } else {
          if (current) result.push(current);
          current = sentence;
        }
      }

      if (current) result.push(current);
    }
  }

  return result.filter((m) => m.length > 0);
}
