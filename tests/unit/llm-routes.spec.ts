/**
 * Rotas com IA (Sprint 2b, Task 8): usam a conexão `llm` da organização do
 * usuário; sem conexão → 409 LLM_NOT_CONFIGURED antes de chamar a API, sem
 * fallback para OPENAI_API_KEY nem user_settings.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ConnectionNotConfiguredError } from '@/lib/connectors/types';

const USER = '00000000-0000-0000-0000-00000000000a';
const ORG = '0a0a0a0a-0000-0000-0000-00000000000a';

const mocks = vi.hoisted(() => ({
  orgForUser: vi.fn(),
  resolveConnection: vi.fn(),
  recordUsage: vi.fn(async () => undefined),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: USER } } }) } }),
}));
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [] }) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: USER } } }) } }),
}));
vi.mock('@/lib/auth/require-writer', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/require-writer')>()),
  requireWriter: async () => true,
}));
vi.mock('@/lib/connectors/org-context', () => ({ resolveOrganizationIdForUser: mocks.orgForUser }));
vi.mock('@/lib/connectors/resolve-connection', () => ({ resolveConnection: mocks.resolveConnection }));
vi.mock('@/lib/connectors/usage', () => ({ recordUsage: mocks.recordUsage }));

import { POST as importMap } from '../../app/api/leads/import/map/route';
import { POST as personalize } from '../../app/api/templates/personalize/route';

const NOT_CONFIGURED = {
  error: {
    code: 'LLM_NOT_CONFIGURED',
    message: 'IA não configurada para esta organização. Fale com a equipe IntelliX.',
  },
};

function post(body: unknown) {
  return new NextRequest('http://x/api/teste', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const MAP_BODY = { columns: ['Nome'], sample: [{ Nome: 'Empresa X' }] };
const PERSONALIZE_BODY = { templateBody: 'Oi {{nome}}', channel: 'whatsapp', lead: { empresa: 'Empresa X' } };

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = 'chave-do-env-proibida';
  mocks.orgForUser.mockResolvedValue(ORG);
  mocks.resolveConnection.mockResolvedValue({
    id: 'conn-llm',
    organizationId: ORG,
    category: 'llm',
    provider: 'openai',
    credentialSource: 'platform',
    config: {},
    secret: { apiKey: 'chave-da-conexao' },
  });
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ mappings: [], unmapped: ['Nome'] }) } }],
        usage: { total_tokens: 30 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  );
});
afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  fetchSpy.mockRestore();
});

const routes = [
  { name: 'POST /api/leads/import/map', call: () => importMap(post(MAP_BODY)) },
  { name: 'POST /api/templates/personalize', call: () => personalize(post(PERSONALIZE_BODY)) },
];

describe.each(routes)('$name', ({ call }) => {
  it('organização sem conexão llm → 409 LLM_NOT_CONFIGURED e nenhuma chamada à API', async () => {
    mocks.resolveConnection.mockRejectedValue(new ConnectionNotConfiguredError(ORG, 'llm'));
    const res = await call();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(NOT_CONFIGURED);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('usuário sem organização → 409 LLM_NOT_CONFIGURED', async () => {
    mocks.orgForUser.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(409);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('usa a chave da conexão da organização e registra os tokens nela', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(mocks.resolveConnection).toHaveBeenCalledWith(ORG, 'llm', 'openai');
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer chave-da-conexao');
    expect(mocks.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, quantity: 30, unit: 'tokens', connectionId: 'conn-llm' })
    );
  });
});
