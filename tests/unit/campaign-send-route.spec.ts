/**
 * S1-F-01 — POST /api/campaigns/[id]/send (canal WhatsApp): a URL Evolution
 * vem de user_settings e passa por assertSafeOutboundUrl ANTES de qualquer
 * efeito (campanha não vai para 'running', nenhum envio é registrado e nenhum
 * fetch sai). Erro de rede não grava detalhe interno em campaign_sends.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, type FakeCall, type FakeResult } from './helpers/fake-supabase';

const USER = '00000000-0000-0000-0000-00000000000a';
const CAMPAIGN = '00000000-0000-0000-0000-0000000000c1';

let evolutionUrl = 'https://evo.cliente.com.br';

function handler(call: FakeCall): FakeResult | undefined {
  if (call.table === 'campaigns' && call.op === 'select') {
    return { data: { id: CAMPAIGN, status: 'draft', channel: 'whatsapp', body: 'Olá', audience_filter: {} }, error: null };
  }
  if (call.table === 'leads_prospeccao') {
    return { data: [{ id: 'lead-1', empresa: 'Empresa 1', whatsapp: '+55 81 99999-0001' }], error: null };
  }
  if (call.table === 'user_settings') {
    return {
      data: { evolution_api_url: evolutionUrl, evolution_api_key: 'chave-do-tenant', evolution_instance_name: 'inst-a' },
      error: null,
    };
  }
  return undefined;
}

const fake = createFakeSupabase(handler);

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: USER } } }) } }),
}));
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [] }) }));
vi.mock('@/lib/auth/require-writer', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/require-writer')>()),
  requireWriter: async () => true,
}));

import { POST } from '../../app/api/campaigns/[id]/send/route';

const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));

function send() {
  return POST(new NextRequest(`http://x/api/campaigns/${CAMPAIGN}/send`, { method: 'POST' }), { params: { id: CAMPAIGN } });
}

beforeEach(() => {
  fake.calls.length = 0;
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  evolutionUrl = 'https://evo.cliente.com.br';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-teste';
});
afterEach(() => vi.unstubAllGlobals());

describe('S1-F-01 — campanha WhatsApp', () => {
  it.each([
    'https://169.254.169.254',
    'https://10.0.0.5:8080',
    'https://localhost',
    'http://evo.cliente.com.br',
    'https://evo.cliente.com.br/?x=1',
  ])('URL Evolution insegura (%s) → 400, sem running, sem envios e sem fetch', async (url) => {
    evolutionUrl = url;
    const res = await send();
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fake.calls.some((c) => c.table === 'campaign_sends')).toBe(false);
    expect(
      fake.calls.some((c) => c.table === 'campaigns' && c.op === 'update' && JSON.stringify(c.payload).includes('running'))
    ).toBe(false);
  });

  it('URL https pública → envia para ela', async () => {
    const res = await send();
    expect(res.status).toBe(200);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe('https://evo.cliente.com.br/message/sendText/inst-a');
  });

  it('erro de rede → campaign_sends sem a mensagem interna do erro', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.5:8080'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await send();
    expect(res.status).toBe(200);
    const failed = fake.calls.find((c) => c.table === 'campaign_sends' && c.op === 'update');
    expect(JSON.stringify(failed?.payload)).not.toContain('ECONNREFUSED');
    expect(failed?.payload).toMatchObject({ status: 'failed' });
    errSpy.mockRestore();
  });
});
