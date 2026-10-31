/**
 * LLM sempre pela conexão `llm` da organização (Sprint 2b, Task 8):
 * sem contexto → ConnectionNotConfiguredError, nunca OPENAI_API_KEY;
 * tokens registrados na organização do contexto.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ConnectionNotConfiguredError } from '@/lib/connectors/types';

const ORG_A = '0a0a0a0a-0000-0000-0000-00000000000a';
const ORG_B = '0b0b0b0b-0000-0000-0000-00000000000b';
const ORG_SEM_LLM = '0c0c0c0c-0000-0000-0000-00000000000c';

const mocks = vi.hoisted(() => ({
  resolveConnection: vi.fn(),
  recordUsage: vi.fn(async () => undefined),
}));

vi.mock('@/lib/connectors/resolve-connection', () => ({
  resolveConnection: mocks.resolveConnection,
}));
vi.mock('@/lib/connectors/usage', () => ({ recordUsage: mocks.recordUsage }));

import {
  withLlmForOrganization,
  getCurrentLlm,
  recordLlmUsage,
} from '@/lib/ai/openai-key-context';
import { generateEmbedding } from '@/lib/ai/rag/embeddings.service';
import { humanizeResponse } from '@/lib/services/message-humanizer.service';

function connFor(orgId: string) {
  return {
    id: `conn-${orgId.slice(0, 4)}`,
    organizationId: orgId,
    category: 'llm',
    provider: 'openai',
    credentialSource: 'own',
    config: { model: 'gpt-4.1-mini' },
    secret: { apiKey: `chave-${orgId.slice(0, 4)}` },
  };
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = 'chave-do-env-proibida';
  mocks.resolveConnection.mockImplementation(async (orgId: string) => {
    if (orgId === ORG_SEM_LLM) throw new ConnectionNotConfiguredError(orgId, 'llm');
    return connFor(orgId);
  });
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    new Response(
      JSON.stringify({
        data: [{ embedding: [0.1, 0.2], index: 0 }],
        usage: { prompt_tokens: 42, total_tokens: 42 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  );
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  fetchSpy.mockRestore();
});

function authHeaderOf(call: unknown[]): string | undefined {
  const init = call[1] as RequestInit | undefined;
  return (init?.headers as Record<string, string> | undefined)?.Authorization;
}

describe('contexto de LLM por organização', () => {
  it('sem contexto → ConnectionNotConfiguredError (mesmo com OPENAI_API_KEY no env)', () => {
    expect(() => getCurrentLlm()).toThrow(ConnectionNotConfiguredError);
  });

  it('serviço chamado fora do contexto não chama a API', async () => {
    await expect(generateEmbedding('texto')).rejects.toBeInstanceOf(ConnectionNotConfiguredError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('dentro de withLlmForOrganization usa a chave e o modelo da conexão', async () => {
    await withLlmForOrganization(ORG_A, async () => {
      expect(getCurrentLlm()).toEqual({
        organizationId: ORG_A,
        connectionId: 'conn-0a0a',
        apiKey: 'chave-0a0a',
        model: 'gpt-4.1-mini',
      });
      await generateEmbedding('texto');
    });
    expect(mocks.resolveConnection).toHaveBeenCalledWith(ORG_A, 'llm', 'openai');
    expect(authHeaderOf(fetchSpy.mock.calls[0])).toBe('Bearer chave-0a0a');
  });

  it('organizações concorrentes não misturam chaves', async () => {
    await Promise.all([
      withLlmForOrganization(ORG_A, () => generateEmbedding('a')),
      withLlmForOrganization(ORG_B, () => generateEmbedding('b')),
    ]);
    const headers = fetchSpy.mock.calls.map(authHeaderOf).sort();
    expect(headers).toEqual(['Bearer chave-0a0a', 'Bearer chave-0b0b']);
  });

  it('org sem llm → erro antes de chamar a API (fn não roda)', async () => {
    const fn = vi.fn(async () => generateEmbedding('x'));
    await expect(withLlmForOrganization(ORG_SEM_LLM, fn)).rejects.toBeInstanceOf(
      ConnectionNotConfiguredError
    );
    expect(fn).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('humanizador fora do contexto não chama a API e cai no split local', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const longo = `${'a'.repeat(200)}.\n\n${'b'.repeat(200)}.`;
    const parts = await humanizeResponse(longo);
    expect(parts.length).toBe(2);
    expect(fetchSpy).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('registro de tokens', () => {
  it('uso de tokens é registrado com a organização e a conexão do contexto', async () => {
    await withLlmForOrganization(ORG_A, () => generateEmbedding('texto'));
    expect(mocks.recordUsage).toHaveBeenCalledWith({
      organizationId: ORG_A,
      category: 'llm',
      provider: 'openai',
      operation: 'embeddings',
      quantity: 42,
      unit: 'tokens',
      connectionId: 'conn-0a0a',
    });
  });

  it('sem total_tokens soma prompt + completion', async () => {
    await withLlmForOrganization(ORG_B, () =>
      recordLlmUsage({ prompt_tokens: 10, completion_tokens: 5 }, 'chat.completions')
    );
    expect(mocks.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_B, quantity: 15, unit: 'tokens' })
    );
  });

  it('sem contexto ou sem uso não registra e não lança', async () => {
    await expect(recordLlmUsage({ total_tokens: 10 }, 'x')).resolves.toBeUndefined();
    await withLlmForOrganization(ORG_A, () => recordLlmUsage(undefined, 'x'));
    expect(mocks.recordUsage).not.toHaveBeenCalled();
  });

  it('falha no registro não bloqueia', async () => {
    mocks.recordUsage.mockRejectedValueOnce(new Error('db down'));
    await expect(
      withLlmForOrganization(ORG_A, () => recordLlmUsage({ total_tokens: 3 }, 'x'))
    ).resolves.toBeUndefined();
  });
});

describe('nenhum caminho lê OPENAI_API_KEY', () => {
  const root = process.cwd();

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
  }

  it('src/ e app/ não leem process.env.OPENAI_API_KEY', () => {
    const offenders = [...walk(join(root, 'src')), ...walk(join(root, 'app'))]
      .filter((f) => /process\.env\.OPENAI_API_KEY|process\.env\[['"]OPENAI_API_KEY/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(root.length + 1));
    expect(offenders).toEqual([]);
  });

  it('caminhos de LLM não leem a chave de user_settings', () => {
    const llmPaths = [
      'src/lib/ai/openai-key-context.ts',
      'src/lib/ai/ai-agent.service.ts',
      'src/lib/ai/rag/embeddings.service.ts',
      'src/lib/services/message-humanizer.service.ts',
      'src/lib/services/pdf-analyzer.service.ts',
      'src/lib/integrations/openai/vision.service.ts',
      'src/lib/integrations/openai/whisper.service.ts',
      'src/lib/services/tenant-resolver.service.ts',
      'src/lib/workflows/lead-conversation.workflow.ts',
      'app/api/admin/rag-ingest/route.ts',
      'app/api/agent/rag/route.ts',
      'app/api/leads/import/map/route.ts',
      'app/api/templates/personalize/route.ts',
    ];
    const offenders = llmPaths.filter((p) =>
      /openai_api_key|openaiApiKey|OPENAI_API_KEY/.test(readFileSync(join(root, p), 'utf8'))
    );
    expect(offenders).toEqual([]);
  });
});
