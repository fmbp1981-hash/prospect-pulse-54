/**
 * T9-C1 (Crítico) — POST /api/whatsapp/send misturava credenciais do usuário
 * com as globais: com evolution_api_url do usuário apontando para um host do
 * atacante e a chave vazia, o servidor enviava a EVOLUTION_API_KEY global para
 * esse host; sem instância própria, a mensagem saía pelo número da plataforma.
 * Agora: instância = resolveInstanceForUser (null → 400); URL+chave do usuário
 * juntas OU URL+chave globais juntas (nunca misturadas; '' conta como ausente);
 * Meta exige credenciais do próprio tenant (sem fallback para META_WA_*).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const USER = '00000000-0000-0000-0000-00000000000a';
let settings: Record<string, unknown> | null = null;

const mocks = vi.hoisted(() => ({ resolveInstanceForUser: vi.fn() }));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      single: async () => ({ data: settings, error: null }),
      maybeSingle: async () => ({ data: settings, error: null }),
    };
    return {
      auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
      from: () => chain,
    };
  },
}));
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [] }) }));
vi.mock('@/lib/services/tenant-resolver.service', () => ({
  resolveInstanceForUser: mocks.resolveInstanceForUser,
}));

import { POST } from '../../app/api/whatsapp/send/route';

const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));

function post(body: unknown) {
  return new NextRequest('http://x/api/whatsapp/send', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}
const BODY = { whatsapp: '+55 81 99999-0001', message: 'oi' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  process.env.EVOLUTION_API_URL = 'https://evolution-global.plataforma';
  process.env.EVOLUTION_API_KEY = 'CHAVE-GLOBAL-SECRETA';
  process.env.EVOLUTION_INSTANCE_NAME = 'inst-global';
  process.env.META_WA_PHONE_NUMBER_ID = 'phone-global';
  process.env.META_WA_TOKEN = 'TOKEN-GLOBAL-META';
  delete process.env.WHATSAPP_PROVIDER;
  mocks.resolveInstanceForUser.mockResolvedValue('inst-org-a');
  settings = { provider: 'evolution', evolution_api_url: '', evolution_api_key: '', evolution_instance_name: 'inst-org-a' };
});
afterEach(() => vi.unstubAllGlobals());

describe('T9-C1 — Evolution', () => {
  it('(a) URL do usuário + chave vazia → 400 e nenhum fetch (chave global nunca vai ao host do usuário)', async () => {
    settings = { ...settings, evolution_api_url: 'https://x.test', evolution_api_key: '' };
    const res = await POST(post(BODY));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('chave do usuário sem URL própria → 400 e nenhum fetch', async () => {
    settings = { ...settings, evolution_api_url: '  ', evolution_api_key: 'chave-do-usuario' };
    const res = await POST(post(BODY));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('(b) usuário sem instância → 400 e nenhum fetch (sem EVOLUTION_INSTANCE_NAME)', async () => {
    mocks.resolveInstanceForUser.mockResolvedValue(null);
    settings = { ...settings, evolution_instance_name: null };
    const res = await POST(post(BODY));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('URL + chave do usuário → usa as duas juntas, com a instância protegida', async () => {
    settings = { ...settings, evolution_api_url: 'https://evo.cliente/', evolution_api_key: 'chave-do-usuario' };
    const res = await POST(post(BODY));
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://evo.cliente/message/sendText/inst-org-a');
    expect((init.headers as Record<string, string>).apikey).toBe('chave-do-usuario');
  });

  it('sem URL/chave próprias → URL + chave globais juntas, com a instância protegida', async () => {
    const res = await POST(post(BODY));
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://evolution-global.plataforma/message/sendText/inst-org-a');
    expect((init.headers as Record<string, string>).apikey).toBe('CHAVE-GLOBAL-SECRETA');
  });
});

describe('T9-C1 — Meta', () => {
  it('(c) tenant Meta sem credenciais próprias → 400 e nenhum fetch (sem META_WA_*)', async () => {
    settings = { provider: 'meta', business_phone_number_id: '', business_access_token: null };
    const res = await POST(post(BODY));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tenant Meta com credenciais próprias → envia com elas', async () => {
    settings = { provider: 'meta', business_phone_number_id: 'phone-tenant', business_access_token: 'token-tenant' };
    const res = await POST(post(BODY));
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/phone-tenant/messages');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-tenant');
  });
});
