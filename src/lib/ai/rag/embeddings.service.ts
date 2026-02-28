/**
 * EMBEDDINGS SERVICE
 * Gera vetores semânticos via OpenAI text-embedding-3-small.
 */

import { openAICircuit, withRetry } from '@/lib/utils/resilience';
import { getCurrentOpenAIKey } from '@/lib/ai/openai-key-context';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

export { EMBEDDING_DIMENSIONS };

export async function generateEmbedding(text: string): Promise<number[]> {
  return openAICircuit.call(() =>
    withRetry(async () => {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getCurrentOpenAIKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: text.slice(0, 8191), // limite do modelo
          model: EMBEDDING_MODEL,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Embeddings API error: ${response.status} ${err}`);
      }

      const data = (await response.json()) as {
        data: Array<{ embedding: number[] }>;
      };

      return data.data[0].embedding;
    }, { maxAttempts: 2 })
  );
}

/**
 * Gera embeddings para múltiplos textos em lote.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  return openAICircuit.call(() =>
    withRetry(async () => {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getCurrentOpenAIKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: texts.map((t) => t.slice(0, 8191)),
          model: EMBEDDING_MODEL,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Embeddings batch error: ${response.status} ${err}`);
      }

      const data = (await response.json()) as {
        data: Array<{ embedding: number[]; index: number }>;
      };

      // Garante ordem correta
      return data.data
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
    }, { maxAttempts: 2 })
  );
}
