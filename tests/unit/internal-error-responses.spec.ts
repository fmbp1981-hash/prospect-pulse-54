/**
 * S1-F-05 — erros internos (mensagem do banco, da Meta, do OpenAI, String(err))
 * não voltam ao cliente: resposta `{ error: { code, message } }` genérica e o
 * detalhe fica só no log.
 *
 * Rotas: /api/clientes/[id] (PATCH, DELETE), /api/campaigns/[id] (PATCH),
 * /api/admin/register-templates, /api/admin/rag-ingest.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, type FakeCall, type FakeResult } from './helpers/fake-supabase';

const USER = '00000000-0000-0000-0000-00000000000a';
const SEGREDO = 'SEGREDO-INTERNO relation "x" constraint fk_y';

let listUsersError = false;

function handler(call: FakeCall): FakeResult | undefined {
  if ((call.table === 'clientes' || call.table === 'campaigns') && call.op === 'update') {
    return { data: null, error: { message: SEGREDO, code: '23503' } };
  }
  if (call.table === 'campaigns' && call.op === 'select') {
    return { data: { status: 'draft' }, error: null };
  }
  if (call.table === 'user_settings') {
    return {
      data: { business_phone_number_id: 'phone-1', business_access_token: 'tok-1' },
      error: null,
    };
  }
  if (call.table === 'agent_configs') return { data: { id: 'agent-1' }, error: null };
  if (call.table === 'rag_documents') return { data: [], error: null };
  return undefined;
}

const fake = createFakeSupabase(handler);
const mocks = vi.hoisted(() => ({ ingestDocument: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    ...fake.client,
    auth: {
      admin: {
        listUsers: async () => (listUsersError
          ? { data: { users: [] }, error: { message: 'SEGREDO-INTERNO auth admin' } }
          : { data: { users: [{ id: USER, email: 'contato@intellixai.com.br' }] }, error: null }),
      },
    },
  }),
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: USER } } }) } }),
}));
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [] }) }));
vi.mock('@/lib/auth/require-writer', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/require-writer')>()),
  requireWriter: async () => true,
}));
vi.mock('@/lib/auth/cron-auth', () => ({ verifyCronRequest: () => true }));
vi.mock('@/lib/ai/rag/rag.service', () => ({ ingestDocument: mocks.ingestDocument }));
vi.mock('@/lib/ai/openai-key-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/openai-key-context')>()),
  resolveLlmForUser: async () => ({ organizationId: 'org-1', connectionId: 'conn-llm', apiKey: 'chave-teste' }),
}));

import { PATCH as clientePatch, DELETE as clienteDelete } from '../../app/api/clientes/[id]/route';
import { PATCH as campaignPatch } from '../../app/api/campaigns/[id]/route';
import { GET as registerTemplates } from '../../app/api/admin/register-templates/route';
import { POST as ragIngest } from '../../app/api/admin/rag-ingest/route';

function req(method: string, body?: unknown) {
  return new NextRequest('http://x/api/teste', {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}),
  });
}

async function expectGeneric(res: Response, status: number) {
  expect(res.status).toBe(status);
  const text = await res.text();
  expect(text).not.toContain('SEGREDO-INTERNO');
  return JSON.parse(text) as Record<string, unknown>;
}

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fake.calls.length = 0;
  listUsersError = false;
  mocks.ingestDocument.mockReset();
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-teste';
});
afterEach(() => {
  errSpy.mockRestore();
  vi.unstubAllGlobals();
});

const params = { params: { id: 'id-1' } };

describe('S1-F-05 — clientes / campanhas', () => {
  it('PATCH /api/clientes/[id] com erro do banco → 500 { error: { code, message } } genérico', async () => {
    const body = await expectGeneric(await clientePatch(req('PATCH', { empresa: 'Nova' }), params), 500);
    expect(body.error).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(errSpy).toHaveBeenCalled();
  });

  it('DELETE /api/clientes/[id] com erro do banco → 500 genérico', async () => {
    const body = await expectGeneric(await clienteDelete(req('DELETE'), params), 500);
    expect(body.error).toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('PATCH /api/campaigns/[id] com erro do banco → 500 genérico', async () => {
    const body = await expectGeneric(await campaignPatch(req('PATCH', { name: 'Nova' }), params), 500);
    expect(body.error).toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});

describe('S1-F-05 — rotas admin (CRON_SECRET)', () => {
  it('register-templates: erro da Meta ao obter WABA → 500 genérico', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'SEGREDO-INTERNO meta' } }))));
    const body = await expectGeneric(await registerTemplates(req('GET')), 500);
    expect(body.error).toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('register-templates: erro por template não expõe a mensagem da Meta', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(JSON.stringify({ error: { message: 'SEGREDO-INTERNO tpl' } }));
      if (url.includes('message_templates')) return new Response(JSON.stringify({ data: [] }));
      return new Response(JSON.stringify({ whatsapp_business_account: { id: 'waba-1' } }));
    }));
    await expectGeneric(await registerTemplates(req('GET')), 207);
  });

  it('rag-ingest: erro do auth admin → 500 genérico', async () => {
    listUsersError = true;
    const body = await expectGeneric(await ragIngest(req('POST')), 500);
    expect(body.error).toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('rag-ingest: erro na ingestão de um documento não expõe a mensagem', async () => {
    mocks.ingestDocument.mockRejectedValue(new Error('SEGREDO-INTERNO openai 401'));
    await expectGeneric(await ragIngest(req('POST')), 207);
  });
});
