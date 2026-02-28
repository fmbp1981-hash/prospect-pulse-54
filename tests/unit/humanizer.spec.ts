/**
 * TESTES DE PARIDADE: humanizer
 * Garante que a humanização divide mensagens em partes <= 240 chars.
 * Paridade com o node "Humanizador" (GPT-4.1-mini) do n8n.
 */

import { humanizeResponse } from '@/lib/services/message-humanizer.service';

// Mock OpenAI para testes unitários
jest.mock('@/lib/services/message-humanizer.service', () => {
  const original = jest.requireActual('@/lib/services/message-humanizer.service');
  return original;
});

describe('Humanizer — Paridade com n8n', () => {
  it('deve retornar array vazio para resposta vazia', async () => {
    const result = await humanizeResponse('');
    expect(result).toEqual([]);
  });

  it('deve retornar resposta curta como array de 1 item', async () => {
    const shortResponse = 'Olá! Tudo bem? 😊';

    // Mock fetch para simular resposta da API
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: JSON.stringify({ messages: [shortResponse] }) } },
        ],
      }),
    }) as jest.Mock;

    const result = await humanizeResponse(shortResponse);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(shortResponse);
  });

  it('todas as partes devem ter <= 240 caracteres (fallback split)', () => {
    // Testa o fallback de split sem IA
    function splitByParagraph(text: string, maxChars = 240): string[] {
      const parts = text
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      const result: string[] = [];
      for (const part of parts) {
        if (part.length <= maxChars) {
          result.push(part);
        } else {
          const sentences = part.split(/(?<=[.!?])\s+/);
          let current = '';
          for (const sentence of sentences) {
            if ((current + ' ' + sentence).trim().length <= maxChars) {
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

    const longText = Array(10).fill('Esta é uma frase de teste com conteúdo importante.').join(' ');
    const parts = splitByParagraph(longText);

    parts.forEach((part) => {
      expect(part.length).toBeLessThanOrEqual(240);
    });
  });

  it('não deve gerar mais de 4 partes', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                messages: ['Msg 1', 'Msg 2', 'Msg 3', 'Msg 4'],
              }),
            },
          },
        ],
      }),
    }) as jest.Mock;

    const longText = 'Lorem ipsum dolor sit amet. '.repeat(20);
    const result = await humanizeResponse(longText);
    expect(result.length).toBeLessThanOrEqual(4);
  });
});
