/**
 * AsyncLocalStorage context para chave OpenAI por tenant.
 * Permite que todos os serviços OpenAI usem a chave do tenant
 * sem precisar passar como parâmetro em cada função.
 *
 * Uso no workflow:
 *   await withOpenAIKey(tenant.openaiApiKey, async () => { ... });
 *
 * Uso nos serviços:
 *   const key = getCurrentOpenAIKey();
 */

import { AsyncLocalStorage } from 'async_hooks';

const keyStorage = new AsyncLocalStorage<string>();

/**
 * Executa `fn` com a chave OpenAI do tenant disponível via AsyncLocalStorage.
 * Todas as chamadas async dentro de `fn` (incluindo aninhadas) verão a mesma chave.
 */
export function withOpenAIKey<T>(key: string, fn: () => Promise<T>): Promise<T> {
  return keyStorage.run(key, fn);
}

/**
 * Retorna a chave OpenAI para o contexto atual.
 * Prioridade: tenant key (via withOpenAIKey) → OPENAI_API_KEY env var.
 */
export function getCurrentOpenAIKey(): string {
  return keyStorage.getStore() ?? process.env.OPENAI_API_KEY ?? '';
}
