/**
 * Circuito de LLM por conexão (fix I1 da Task 8): falhas de uma organização
 * não bloqueiam a IA das outras; 401/403/429 de cota são erro da credencial
 * da organização, não indisponibilidade da OpenAI (não abrem o circuito nem
 * são repetidos).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runWithLlm, type LlmContext } from '@/lib/ai/openai-key-context';
import { generateEmbedding } from '@/lib/ai/rag/embeddings.service';
import { LlmHttpError, resetProviderCircuitsForTests } from '@/lib/utils/resilience';

vi.mock('@/lib/connectors/usage', () => ({ recordUsage: vi.fn(async () => undefined) }));

const A: LlmContext = { organizationId: 'org-a', connectionId: 'conn-a', apiKey: 'chave-a' };
const B: LlmContext = { organizationId: 'org-b', connectionId: 'conn-b', apiKey: 'chave-b' };

let responseForA: () => Response;
let fetchSpy: ReturnType<typeof vi.spyOn>;
const ok = () =>
  new Response(JSON.stringify({ data: [{ embedding: [1], index: 0 }], usage: { total_tokens: 1 } }), { status: 200 });
const err = (status: number, code: string) =>
  new Response(JSON.stringify({ error: { code, message: 'Incorrect API key provided: chave-****' } }), { status });

const callsFor = (key: string) =>
  fetchSpy.mock.calls.filter(
    (c) => ((c[1] as RequestInit).headers as Record<string, string>).Authorization === `Bearer ${key}`
  ).length;

beforeEach(() => {
  resetProviderCircuitsForTests();
  responseForA = () => err(401, 'invalid_api_key');
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const auth = ((init as RequestInit).headers as Record<string, string>).Authorization;
    return auth === 'Bearer chave-a' ? responseForA() : ok();
  });
});
afterEach(() => fetchSpy.mockRestore());

describe('circuito de LLM por conexão', () => {
  it('401 repetidos da org A não abrem o circuito de A nem são repetidos', async () => {
    for (let i = 0; i < 5; i++) {
      const e = await runWithLlm(A, () => generateEmbedding('x')).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(LlmHttpError);
      expect((e as LlmHttpError).status).toBe(401);
      expect((e as Error).message).not.toContain('chave');
    }
    expect(callsFor('chave-a')).toBe(5); // 1 tentativa por chamada, nenhuma barrada pelo circuito
  });

  it('429 por falta de cota não abre o circuito', async () => {
    responseForA = () => err(429, 'insufficient_quota');
    for (let i = 0; i < 4; i++) {
      await runWithLlm(A, () => generateEmbedding('x')).catch(() => undefined);
    }
    expect(callsFor('chave-a')).toBe(4);
  });

  it('5xx da org A abre só o circuito de A; org B continua funcionando', async () => {
    responseForA = () => err(500, 'server_error');
    for (let i = 0; i < 3; i++) {
      await runWithLlm(A, () => generateEmbedding('x')).catch(() => undefined);
    }
    const before = callsFor('chave-a');
    await expect(runWithLlm(A, () => generateEmbedding('x'))).rejects.toThrow(/Circuit breaker OPEN/);
    expect(callsFor('chave-a')).toBe(before);

    await expect(runWithLlm(B, () => generateEmbedding('y'))).resolves.toEqual([1]);
  });
});
