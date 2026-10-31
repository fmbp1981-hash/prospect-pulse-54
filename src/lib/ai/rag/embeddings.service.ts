/**
 * EMBEDDINGS SERVICE
 * Gera vetores semânticos via OpenAI text-embedding-3-small.
 */

import { getLlmCircuit, countsAsLlmFailure, shouldRetryLlm, withRetry } from '@/lib/utils/resilience';
import { getCurrentLlm, recordLlmUsage, toLlmHttpError, type LlmUsage } from '@/lib/ai/openai-key-context';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

export { EMBEDDING_DIMENSIONS };

export async function generateEmbedding(text: string): Promise<number[]> {
  const { apiKey, connectionId } = getCurrentLlm();
  return getLlmCircuit(connectionId).call(() =>
    withRetry(async () => {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: text.slice(0, 8191), // limite do modelo
          model: EMBEDDING_MODEL,
        }),
      });

      if (!response.ok) throw await toLlmHttpError(response, 'Embeddings API error');

      const data = (await response.json()) as {
        data: Array<{ embedding: number[] }>;
        usage?: LlmUsage;
      };
      await recordLlmUsage(data.usage, 'embeddings');

      return data.data[0].embedding;
    }, { maxAttempts: 2, shouldRetry: shouldRetryLlm }),
    countsAsLlmFailure
  );
}

/**
 * Gera embeddings para múltiplos textos em lote.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const { apiKey, connectionId } = getCurrentLlm();
  return getLlmCircuit(connectionId).call(() =>
    withRetry(async () => {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: texts.map((t) => t.slice(0, 8191)),
          model: EMBEDDING_MODEL,
        }),
      });

      if (!response.ok) throw await toLlmHttpError(response, 'Embeddings batch error');

      const data = (await response.json()) as {
        data: Array<{ embedding: number[]; index: number }>;
        usage?: LlmUsage;
      };
      await recordLlmUsage(data.usage, 'embeddings');

      // Garante ordem correta
      return data.data
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
    }, { maxAttempts: 2, shouldRetry: shouldRetryLlm }),
    countsAsLlmFailure
  );
}
