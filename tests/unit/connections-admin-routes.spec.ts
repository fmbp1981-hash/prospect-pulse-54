/**
 * Task 10 (Sprint 2b) — API do admin da plataforma para conexões e
 * credenciais, teste de conexão e status para membros.
 *
 * Review Focus 2: PUT sem `secret` mantém o segredo; `secret` com campo
 * vazio → 400. Nenhuma resposta contém segredo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, filterValue, type FakeCall, type FakeResult } from './helpers/fake-supabase';

const PLATFORM_ADMIN = '00000000-0000-0000-0000-0000000000aa';
const ORG_MEMBER = '00000000-0000-0000-0000-0000000000bb';
const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const MISSING_ID = '99999999-9999-4999-8999-999999999999';

// Valores falsos de teste (não são credenciais reais).
const OPENAI_KEY = 'fake-openai-SEGREDO-abcd1234';
const EVOLUTION_KEY = 'fake-evo-SEGREDO-9876';
const PLACES_KEY = 'fake-places-SEGREDO-5555';
const META_SECRET = {
  accessToken: 'fake-meta-SEGREDO-7777',
  appSecret: 'fake-app-SEGREDO',
  verifyToken: 'fake-verify-SEGREDO',
};

type Row = Record<string, unknown>;

let currentUser: { id: string } | null = null;
const platformAdmins = new Set<string>([PLATFORM_ADMIN]);
const memberships = new Map<string, string>([[ORG_MEMBER, ORG_A]]);
let connections: Map<string, Row>;
let platformCreds: Map<string, Row>;
let seq = 0;

const SECRET_KEYS = /"(secret|apiKey|accessToken|appSecret|verifyToken|apiToken)"\s*:/;
const PLAINTEXT = [OPENAI_KEY, EVOLUTION_KEY, PLACES_KEY, ...Object.values(META_SECRET)];

function pick(row: Row, columns: string | undefined): Row {
  if (!columns || columns.trim() === '*') return { ...row };
  const out: Row = {};
  for (const c of columns.split(',').map((s) => s.trim()).filter(Boolean)) out[c] = row[c];
  return out;
}

function matches(row: Row, call: FakeCall): boolean {
  return call.filters.every((f) =>
    f.kind === 'eq' ? row[f.column] === f.value : f.kind === 'neq' ? row[f.column] !== f.value : true
  );
}

function nextUuid(): string {
  seq += 1;
  return `aaaaaaaa-aaaa-4aaa-8aaa-${String(seq).padStart(12, '0')}`;
}

function connectionsHandler(call: FakeCall): FakeResult {
  const rows = [...connections.values()].filter((r) => matches(r, call));
  if (call.op === 'select') {
    const single = call.filters.some((f) => f.column === 'id' || f.column === 'provider');
    if (single) return { data: rows[0] ? pick(rows[0], call.columns) : null, error: null };
    return { data: rows.map((r) => pick(r, call.columns)), error: null };
  }
  if (call.op === 'upsert') {
    const p = call.payload as Row;
    const existing = [...connections.values()].find(
      (r) => r.organization_id === p.organization_id && r.category === p.category && r.provider === p.provider
    );
    const now = new Date().toISOString();
    const row: Row = existing
      ? { ...existing, ...p, updated_at: now }
      : {
          id: nextUuid(),
          secret: null,
          last_tested_at: null,
          last_test_result: null,
          webhook_key: p.category === 'whatsapp' ? `wk${String(seq).padStart(30, '0')}` : null,
          created_at: now,
          ...p,
          updated_at: now,
        };
    connections.set(row.id as string, row);
    return { data: pick(row, call.columns), error: null };
  }
  if (call.op === 'update') {
    for (const r of rows) Object.assign(r, call.payload as Row);
    return { data: call.returning ? rows.map((r) => ({ id: r.id })) : null, error: null };
  }
  if (call.op === 'delete') {
    for (const r of rows) connections.delete(r.id as string);
    return { data: call.returning ? rows.map((r) => ({ id: r.id })) : null, error: null };
  }
  return { data: null, error: null };
}

function handler(call: FakeCall): FakeResult | undefined {
  if (call.table === 'platform_admins') {
    const uid = filterValue(call, 'user_id') as string;
    return { data: platformAdmins.has(uid) ? { user_id: uid } : null, error: null };
  }
  if (call.table === 'organizations') {
    return { data: [{ id: ORG_A, name: 'Org A' }, { id: ORG_B, name: 'Org B' }], error: null };
  }
  if (call.table === 'organization_members') {
    const org = memberships.get(filterValue(call, 'user_id') as string);
    return { data: org ? { organization_id: org } : null, error: null };
  }
  if (call.table === 'organization_connections') return connectionsHandler(call);
  if (call.table === 'platform_credentials') {
    if (call.op === 'upsert') {
      const p = call.payload as Row;
      const row = {
        id: nextUuid(),
        created_at: 'x',
        ...platformCreds.get(p.provider as string),
        ...p,
        updated_at: 'agora',
      };
      platformCreds.set(p.provider as string, row);
      return { data: null, error: null };
    }
    const provider = filterValue(call, 'provider') as string | undefined;
    if (provider) return { data: platformCreds.get(provider) ?? null, error: null };
    return { data: [...platformCreds.values()], error: null };
  }
  return undefined;
}

const fake = createFakeSupabase(handler);

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: currentUser } }) } }),
}));

import { GET as listOrgs } from '../../app/api/admin/organizations/route';
import { GET as listConns, PUT as putConn } from '../../app/api/admin/organizations/[orgId]/connections/route';
import {
  PATCH as patchConn,
  DELETE as deleteConn,
} from '../../app/api/admin/organizations/[orgId]/connections/[connectionId]/route';
import { POST as testConn } from '../../app/api/admin/organizations/[orgId]/connections/[connectionId]/test/route';
import {
  GET as listPlatform,
  PUT as putPlatform,
} from '../../app/api/admin/platform-credentials/route';
import { GET as statusRoute } from '../../app/api/connections/status/route';

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function req(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/x', {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const orgCtx = (orgId = ORG_A) => ({ params: { orgId } });
const connCtx = (connectionId: string, orgId = ORG_A) => ({ params: { orgId, connectionId } });

async function jsonOf(res: Response): Promise<{ text: string; body: Record<string, unknown> }> {
  const text = await res.text();
  return { text, body: JSON.parse(text) as Record<string, unknown> };
}

function expectNoSecrets(text: string) {
  expect(text).not.toMatch(SECRET_KEYS);
  for (const s of PLAINTEXT) expect(text).not.toContain(s);
}

/** `secret = null` omite o campo do corpo. */
async function createOpenAi(secret: Record<string, string> | null = { apiKey: OPENAI_KEY }) {
  currentUser = { id: PLATFORM_ADMIN };
  return putConn(
    req('PUT', {
      category: 'llm',
      provider: 'openai',
      credentialSource: 'own',
      config: { model: 'gpt-4o-mini' },
      ...(secret ? { secret } : {}),
    }),
    orgCtx()
  );
}

const firstId = () => [...connections.keys()][0];
const dataWrites = () =>
  fake.calls.filter((c) => c.op !== 'select' && c.table !== 'platform_admins');

beforeEach(() => {
  fake.calls.length = 0;
  connections = new Map();
  platformCreds = new Map();
  currentUser = null;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-teste';
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.exemplo.com/';
  process.env.CONNECTORS_MASTER_KEY_V1 = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
  process.env.CONNECTORS_ACTIVE_KEY_VERSION = 'v1';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('autorização das rotas /api/admin/*', () => {
  const calls = (id: string) => [
    () => listOrgs(),
    () => listConns(req('GET'), orgCtx()),
    () =>
      putConn(
        req('PUT', { category: 'llm', provider: 'openai', credentialSource: 'own', config: {}, secret: { apiKey: OPENAI_KEY } }),
        orgCtx()
      ),
    () => patchConn(req('PATCH', { status: 'disabled' }), connCtx(id)),
    () => deleteConn(req('DELETE'), connCtx(id)),
    () => testConn(req('POST'), connCtx(id)),
    () => listPlatform(),
    () => putPlatform(req('PUT', { provider: 'openai', secret: { apiKey: OPENAI_KEY } })),
  ];

  it('membro que não é admin da plataforma → 403 em todas, sem escrita nem chamada externa', async () => {
    await createOpenAi();
    const id = firstId();
    fake.calls.length = 0;
    currentUser = { id: ORG_MEMBER };
    for (const call of calls(id)) {
      const res = await call();
      expect(res.status).toBe(403);
    }
    expect(dataWrites()).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(connections.size).toBe(1);
  });

  it('sem sessão → 401 em todas', async () => {
    for (const call of calls(MISSING_ID)) {
      const res = await call();
      expect(res.status).toBe(401);
    }
    expect(dataWrites()).toHaveLength(0);
  });

  it('orgId/connectionId que não são UUID → 400', async () => {
    currentUser = { id: PLATFORM_ADMIN };
    expect((await listConns(req('GET'), orgCtx('nao-e-uuid'))).status).toBe(400);
    expect((await testConn(req('POST'), connCtx('x'))).status).toBe(400);
  });

  it('admin lista organizações em { data, meta }', async () => {
    currentUser = { id: PLATFORM_ADMIN };
    const { body } = await jsonOf(await listOrgs());
    expect(body.data).toEqual([
      { id: ORG_A, name: 'Org A' },
      { id: ORG_B, name: 'Org B' },
    ]);
    expect(body.meta).toEqual({ total: 2 });
  });
});

describe('PUT de conexão (Review Focus 2)', () => {
  it('cria conexão própria com segredo cifrado e status pending_test, sem devolver segredo', async () => {
    const res = await createOpenAi();
    expect(res.status).toBe(200);
    const { text, body } = await jsonOf(res);
    expectNoSecrets(text);
    expect(body.data).toMatchObject({
      category: 'llm',
      provider: 'openai',
      credentialSource: 'own',
      status: 'pending_test',
      hasSecret: true,
      secretHint: '1234',
      webhookUrl: null,
      configuredBy: PLATFORM_ADMIN,
    });
    const stored = connections.get(firstId())!;
    expect(JSON.stringify(stored.secret)).not.toContain(OPENAI_KEY);
    expect(stored.secret).toMatchObject({ v: 'v1' });
  });

  it('PUT sem secret mantém o segredo atual e volta para pending_test', async () => {
    await createOpenAi();
    const row = connections.get(firstId())!;
    const originalSecret = row.secret;
    row.status = 'active';
    fake.calls.length = 0;

    const res = await putConn(
      req('PUT', { category: 'llm', provider: 'openai', credentialSource: 'own', config: { model: 'gpt-4o' } }),
      orgCtx()
    );
    expect(res.status).toBe(200);
    const upsert = fake.calls.find((c) => c.table === 'organization_connections' && c.op === 'upsert');
    expect(upsert?.payload).not.toHaveProperty('secret');
    const after = connections.get(row.id as string)!;
    expect(after.secret).toEqual(originalSecret);
    expect(after.config).toEqual({ model: 'gpt-4o' });
    expect(after.status).toBe('pending_test');
    const { body } = await jsonOf(res);
    expect(body.data).toMatchObject({ hasSecret: true, secretHint: '1234' });
  });

  it('PUT com campo de segredo vazio → 400 e nada é gravado', async () => {
    await createOpenAi();
    const before = JSON.stringify([...connections.values()]);
    fake.calls.length = 0;
    const res = await createOpenAi({ apiKey: '   ' });
    expect(res.status).toBe(400);
    const { body } = await jsonOf(res);
    expect((body.error as { code: string }).code).toBe('VALIDATION_ERROR');
    expect(dataWrites()).toHaveLength(0);
    expect(JSON.stringify([...connections.values()])).toBe(before);
  });

  it('credentialSource own em conexão nova sem secret → 400', async () => {
    const res = await createOpenAi(null);
    expect(res.status).toBe(400);
    expect(connections.size).toBe(0);
  });

  it('credentialSource platform sem secret é aceito', async () => {
    currentUser = { id: PLATFORM_ADMIN };
    const res = await putConn(
      req('PUT', { category: 'prospecting', provider: 'google_places', credentialSource: 'platform', config: {} }),
      orgCtx()
    );
    expect(res.status).toBe(200);
    const { body } = await jsonOf(res);
    expect(body.data).toMatchObject({ credentialSource: 'platform', hasSecret: false, secretHint: null });
  });

  it('provedor fora da categoria → 400', async () => {
    currentUser = { id: PLATFORM_ADMIN };
    const res = await putConn(
      req('PUT', { category: 'email', provider: 'openai', credentialSource: 'own', config: {}, secret: { apiKey: OPENAI_KEY } }),
      orgCtx()
    );
    expect(res.status).toBe(400);
  });

  it.each([
    'https://localhost/evo',
    'https://10.0.0.5',
    'https://192.168.1.10',
    'https://127.0.0.1:8080',
    'http://evo.exemplo.com',
    'https://evo.internal',
  ])('evolution baseUrl %s (privado/localhost/não https) → 400', async (baseUrl) => {
    currentUser = { id: PLATFORM_ADMIN };
    const res = await putConn(
      req('PUT', {
        category: 'whatsapp',
        provider: 'evolution',
        credentialSource: 'own',
        config: { baseUrl, instanceName: 'inst' },
        secret: { apiKey: EVOLUTION_KEY },
      }),
      orgCtx()
    );
    expect(res.status).toBe(400);
    expect(connections.size).toBe(0);
  });

  it('whatsapp: GET devolve webhookUrl ao admin e nunca o segredo nem o webhook_key cru', async () => {
    currentUser = { id: PLATFORM_ADMIN };
    await putConn(
      req('PUT', {
        category: 'whatsapp',
        provider: 'meta_cloud',
        credentialSource: 'own',
        config: { phoneNumberId: '123456', apiVersion: 'v20.0' },
        secret: META_SECRET,
      }),
      orgCtx()
    );
    const row = connections.get(firstId())!;
    const { text, body } = await jsonOf(await listConns(req('GET'), orgCtx()));
    expectNoSecrets(text);
    expect(text).not.toContain('"webhook_key"');
    const [conn] = body.data as Array<Record<string, unknown>>;
    expect(conn.webhookUrl).toBe(`https://app.exemplo.com/api/webhooks/whatsapp/${row.webhook_key as string}`);
    expect(conn.secretHint).toBe('7777');
  });
});

describe('PATCH / DELETE', () => {
  it('PATCH disabled altera o status; status fora de active|disabled → 400', async () => {
    await createOpenAi();
    const id = firstId();
    expect((await patchConn(req('PATCH', { status: 'failing' }), connCtx(id))).status).toBe(400);
    const res = await patchConn(req('PATCH', { status: 'disabled' }), connCtx(id));
    expect(res.status).toBe(200);
    const { text, body } = await jsonOf(res);
    expectNoSecrets(text);
    expect(body.data).toMatchObject({ id, status: 'disabled' });
  });

  it('conexão de outra organização → 404 em PATCH, DELETE e teste', async () => {
    await createOpenAi();
    const id = firstId();
    expect((await patchConn(req('PATCH', { status: 'disabled' }), connCtx(id, ORG_B))).status).toBe(404);
    expect((await deleteConn(req('DELETE'), connCtx(id, ORG_B))).status).toBe(404);
    expect((await testConn(req('POST'), connCtx(id, ORG_B))).status).toBe(404);
    expect(connections.get(id)?.status).toBe('pending_test');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('DELETE remove a conexão da organização', async () => {
    await createOpenAi();
    const res = await deleteConn(req('DELETE'), connCtx(firstId()));
    expect(res.status).toBe(200);
    expect(connections.size).toBe(0);
  });
});

describe('teste de conexão', () => {
  it('ok → active, grava last_tested_at/last_test_result sem segredo', async () => {
    await createOpenAi();
    const id = firstId();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));

    const res = await testConn(req('POST'), connCtx(id));
    expect(res.status).toBe(200);
    const { text, body } = await jsonOf(res);
    expectNoSecrets(text);
    const data = body.data as { result: { ok: boolean }; connection: { status: string } };
    expect(data.result.ok).toBe(true);
    expect(data.connection.status).toBe('active');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/models');
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${OPENAI_KEY}`);
    expect(init?.signal).toBeInstanceOf(AbortSignal);

    const row = connections.get(id)!;
    expect(row.status).toBe('active');
    expect(row.last_tested_at).toEqual(expect.any(String));
    expect(String(row.last_test_result)).not.toContain(OPENAI_KEY);
  });

  it('falha → failing com mensagem sem segredo nem corpo do provedor', async () => {
    await createOpenAi();
    const id = firstId();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: `Incorrect API key provided: ${OPENAI_KEY}` } }), { status: 401 })
    );
    const { text, body } = await jsonOf(await testConn(req('POST'), connCtx(id)));
    expectNoSecrets(text);
    const data = body.data as { result: { ok: boolean; message: string }; connection: { status: string } };
    expect(data.result.ok).toBe(false);
    expect(data.result.message).toContain('401');
    expect(data.connection.status).toBe('failing');
    const row = connections.get(id)!;
    expect(row.status).toBe('failing');
    expect(String(row.last_test_result)).not.toContain(OPENAI_KEY);
  });

  it('erro de rede com a chave na mensagem (Google Places) → failing com mensagem genérica', async () => {
    currentUser = { id: PLATFORM_ADMIN };
    await putConn(
      req('PUT', { category: 'prospecting', provider: 'google_places', credentialSource: 'own', config: {}, secret: { apiKey: PLACES_KEY } }),
      orgCtx()
    );
    const id = firstId();
    fetchMock.mockRejectedValueOnce(new TypeError(`fetch failed for ...&key=${PLACES_KEY}`));
    const { text, body } = await jsonOf(await testConn(req('POST'), connCtx(id)));
    expectNoSecrets(text);
    expect((body.data as { result: { ok: boolean } }).result.ok).toBe(false);
    expect(String(connections.get(id)!.last_test_result)).not.toContain(PLACES_KEY);
    expect(connections.get(id)!.status).toBe('failing');
  });

  it('evolution com state open → active (endpoint connectionState da instância)', async () => {
    currentUser = { id: PLATFORM_ADMIN };
    await putConn(
      req('PUT', {
        category: 'whatsapp',
        provider: 'evolution',
        credentialSource: 'own',
        config: { baseUrl: 'https://evo.exemplo.com/', instanceName: 'minha inst' },
        secret: { apiKey: EVOLUTION_KEY },
      }),
      orgCtx()
    );
    const id = firstId();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ instance: { state: 'open' } }), { status: 200 }));
    const { body } = await jsonOf(await testConn(req('POST'), connCtx(id)));
    expect((body.data as { connection: { status: string } }).connection.status).toBe('active');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://evo.exemplo.com/instance/connectionState/minha%20inst');
    expect((init?.headers as Record<string, string>).apikey).toBe(EVOLUTION_KEY);
  });

  it('evolution com state close → failing', async () => {
    currentUser = { id: PLATFORM_ADMIN };
    await putConn(
      req('PUT', {
        category: 'whatsapp',
        provider: 'evolution',
        credentialSource: 'own',
        config: { baseUrl: 'https://evo.exemplo.com', instanceName: 'inst' },
        secret: { apiKey: EVOLUTION_KEY },
      }),
      orgCtx()
    );
    const id = firstId();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ instance: { state: 'close' } }), { status: 200 }));
    const { body } = await jsonOf(await testConn(req('POST'), connCtx(id)));
    expect((body.data as { connection: { status: string } }).connection.status).toBe('failing');
  });

  it('platform sem credencial da plataforma → failing sem chamar o provedor', async () => {
    currentUser = { id: PLATFORM_ADMIN };
    await putConn(
      req('PUT', { category: 'prospecting', provider: 'apify', credentialSource: 'platform', config: {} }),
      orgCtx()
    );
    const { body } = await jsonOf(await testConn(req('POST'), connCtx(firstId())));
    const data = body.data as { result: { ok: boolean }; connection: { status: string } };
    expect(data.result.ok).toBe(false);
    expect(data.connection.status).toBe('failing');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('platform usa a credencial da plataforma do provedor', async () => {
    currentUser = { id: PLATFORM_ADMIN };
    const put = await putPlatform(req('PUT', { provider: 'apify', secret: { apiToken: 'fake-apify-SEGREDO-4321' } }));
    expect(put.status).toBe(200);
    await putConn(
      req('PUT', { category: 'prospecting', provider: 'apify', credentialSource: 'platform', config: {} }),
      orgCtx()
    );
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const { body } = await jsonOf(await testConn(req('POST'), connCtx(firstId())));
    expect((body.data as { connection: { status: string } }).connection.status).toBe('active');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.apify.com/v2/users/me');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer fake-apify-SEGREDO-4321');
  });
});

describe('credenciais da plataforma', () => {
  it('PUT grava cifrado e GET/PUT nunca devolvem o segredo', async () => {
    currentUser = { id: PLATFORM_ADMIN };
    const put = await putPlatform(req('PUT', { provider: 'openai', secret: { apiKey: OPENAI_KEY } }));
    expect(put.status).toBe(200);
    const putJson = await jsonOf(put);
    expectNoSecrets(putJson.text);
    expect(putJson.body.data).toMatchObject({ provider: 'openai', hasSecret: true, secretHint: '1234' });
    expect(JSON.stringify(platformCreds.get('openai')?.secret)).not.toContain(OPENAI_KEY);

    const get = await jsonOf(await listPlatform());
    expectNoSecrets(get.text);
    expect(get.body.data).toEqual([expect.objectContaining({ provider: 'openai', hasSecret: true })]);
  });

  it('PUT com segredo vazio → 400', async () => {
    currentUser = { id: PLATFORM_ADMIN };
    const res = await putPlatform(req('PUT', { provider: 'openai', secret: { apiKey: '' } }));
    expect(res.status).toBe(400);
    expect(platformCreds.size).toBe(0);
  });
});

describe('GET /api/connections/status', () => {
  it('devolve só a organização do usuário, com campos de status apenas', async () => {
    await createOpenAi();
    await putConn(
      req('PUT', { category: 'llm', provider: 'openai', credentialSource: 'own', config: {}, secret: { apiKey: 'fake-outra-org-0000' } }),
      orgCtx(ORG_B)
    );
    fake.calls.length = 0;
    currentUser = { id: ORG_MEMBER };
    const res = await statusRoute();
    expect(res.status).toBe(200);
    const { text, body } = await jsonOf(res);
    expectNoSecrets(text);
    expect(body.data).toEqual([
      { category: 'llm', provider: 'openai', status: 'pending_test', lastTestedAt: null },
    ]);
    const statusQuery = fake.calls.find((c) => c.table === 'organization_connections' && c.op === 'select');
    expect(filterValue(statusQuery!, 'organization_id')).toBe(ORG_A);
    expect(statusQuery!.columns).not.toMatch(/\bsecret\b|webhook_key/);
  });

  it('sem sessão → 401; usuário sem organização → lista vazia', async () => {
    expect((await statusRoute()).status).toBe(401);
    currentUser = { id: '00000000-0000-0000-0000-0000000000ff' };
    const { body } = await jsonOf(await statusRoute());
    expect(body.data).toEqual([]);
  });
});
