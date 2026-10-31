/**
 * POST /api/campaigns/[id]/send — canal WhatsApp.
 *
 * Histórico: S1-F-01 (URL Evolution de user_settings validada contra SSRF).
 * T5-ISO-02 (Sprint 2b): o canal WhatsApp não lê mais user_settings.evolution_*;
 * a organização vem de resolveOrganizationIdForUser(user.id), a campanha tem de
 * ser dela (senão 404) e o envio sai pela conexão ativa da organização
 * (getWhatsAppForOrganization). Sem conexão → 409 WHATSAPP_NOT_CONFIGURED antes
 * de qualquer efeito (sem 'running', sem campaign_sends, sem fetch).
 * O canal de e-mail é da Task 7 e não é coberto aqui.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, type FakeCall, type FakeResult } from './helpers/fake-supabase';
import type { OrgWhatsApp } from '@/lib/integrations/whatsapp/org-whatsapp';
import { ConnectionNotConfiguredError } from '@/lib/connectors/types';

const USER = '00000000-0000-0000-0000-00000000000a';
const CAMPAIGN = '00000000-0000-0000-0000-0000000000c1';
const ORG_A = '0a0a0a0a-0000-0000-0000-00000000000a';
const ORG_B = '0b0b0b0b-0000-0000-0000-00000000000b';
const ORG_SEM_WA = '0c0c0c0c-0000-0000-0000-00000000000c';

let campaignOrg: string | null = ORG_A;

function handler(call: FakeCall): FakeResult | undefined {
  if (call.table === 'campaigns' && call.op === 'select') {
    return {
      data: { id: CAMPAIGN, status: 'draft', channel: 'whatsapp', body: 'Olá', audience_filter: {}, organization_id: campaignOrg, user_id: USER },
      error: null,
    };
  }
  if (call.table === 'leads_prospeccao') {
    return { data: [{ id: 'lead-1', empresa: 'Empresa 1', whatsapp: '+55 81 99999-0001' }], error: null };
  }
  if (call.table === 'user_settings') {
    // Legado preenchido: NÃO pode ser usado como fallback.
    return {
      data: { evolution_api_url: 'https://evo.legado.com.br', evolution_api_key: 'chave-legada', evolution_instance_name: 'inst-legada' },
      error: null,
    };
  }
  return undefined;
}

const fake = createFakeSupabase(handler);

const mocks = vi.hoisted(() => ({ findOrgForUser: vi.fn(), sendText: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: USER } } }) } }),
}));
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [] }) }));
vi.mock('@/lib/auth/require-writer', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/require-writer')>()),
  requireWriter: async () => true,
}));
vi.mock('@/lib/repositories/connections.repository', () => ({
  connectionsRepository: { findOrganizationIdForUser: mocks.findOrgForUser },
}));

import { POST } from '../../app/api/campaigns/[id]/send/route';
import { setWhatsAppProviderFactoryForTests } from '@/lib/integrations/whatsapp/org-whatsapp';

const factory = vi.fn(async (orgId: string): Promise<OrgWhatsApp> => {
  if (orgId === ORG_A) {
    return {
      provider: { sendText: mocks.sendText } as unknown as OrgWhatsApp['provider'],
      target: 'inst-da-conexao',
      connectionId: 'conn-a',
      organizationId: ORG_A,
    };
  }
  throw new ConnectionNotConfiguredError(orgId, 'whatsapp');
});

const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));

function send() {
  return POST(new NextRequest(`http://x/api/campaigns/${CAMPAIGN}/send`, { method: 'POST' }), { params: { id: CAMPAIGN } });
}

function noEffects() {
  expect(fetchMock).not.toHaveBeenCalled();
  expect(mocks.sendText).not.toHaveBeenCalled();
  expect(fake.calls.some((c) => c.table === 'campaign_sends')).toBe(false);
  expect(
    fake.calls.some((c) => c.table === 'campaigns' && c.op === 'update' && JSON.stringify(c.payload).includes('running'))
  ).toBe(false);
}

beforeEach(() => {
  fake.calls.length = 0;
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  setWhatsAppProviderFactoryForTests(factory);
  campaignOrg = ORG_A;
  mocks.findOrgForUser.mockResolvedValue(ORG_A);
  mocks.sendText.mockResolvedValue({ success: true, messageId: 'm1' });
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-teste';
  process.env.EVOLUTION_API_URL = 'https://evolution-global.plataforma';
  process.env.EVOLUTION_API_KEY = 'CHAVE-GLOBAL';
});
afterEach(() => {
  vi.unstubAllGlobals();
  setWhatsAppProviderFactoryForTests(null);
});

describe('T5-ISO-02 — campanha WhatsApp pela conexão da organização', () => {
  it('envia pela conexão da organização (alvo da conexão), sem fetch direto nem user_settings', async () => {
    const res = await send();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sent: 1, failed: 0 });
    expect(factory).toHaveBeenCalledWith(ORG_A);
    expect(mocks.sendText).toHaveBeenCalledWith('inst-da-conexao', '5581999990001', 'Olá');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fake.calls.some((c) => c.table === 'user_settings')).toBe(false);
  });

  it('org sem conexão (com user_settings.evolution_* preenchido) → 409 e nenhum efeito', async () => {
    mocks.findOrgForUser.mockResolvedValue(ORG_SEM_WA);
    campaignOrg = ORG_SEM_WA;
    const res = await send();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: {
        code: 'WHATSAPP_NOT_CONFIGURED',
        message: 'WhatsApp não configurado para esta organização. Fale com a equipe IntelliX.',
      },
    });
    noEffects();
  });

  it('usuário sem organização → 409 e nenhum efeito', async () => {
    mocks.findOrgForUser.mockResolvedValue(null);
    campaignOrg = null;
    const res = await send();
    expect(res.status).toBe(409);
    noEffects();
  });

  it('campanha de outra organização → 404 e nenhum efeito', async () => {
    campaignOrg = ORG_B;
    const res = await send();
    expect(res.status).toBe(404);
    noEffects();
  });

  it('campanha com organization_id nulo → usa a organização do dono', async () => {
    campaignOrg = null;
    const res = await send();
    expect(res.status).toBe(200);
    expect(factory).toHaveBeenCalledWith(ORG_A);
  });

  it('falha do provedor → campaign_sends failed só com o status HTTP (sem corpo interno); log sem telefone', async () => {
    mocks.sendText.mockResolvedValue({ success: false, error: 'Evolution sendText failed: 400 DETALHE-INTERNO 5581999990001' });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await send();
    expect(res.status).toBe(200);
    const failed = fake.calls.find((c) => c.table === 'campaign_sends' && c.op === 'update');
    expect(failed?.payload).toMatchObject({ status: 'failed', error: 'HTTP 400' });
    expect(JSON.stringify(failed?.payload)).not.toContain('DETALHE-INTERNO');
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain('99999');
    errSpy.mockRestore();
  });

  it('falha sem status (rede/timeout) → motivo genérico', async () => {
    mocks.sendText.mockResolvedValue({ success: false, error: 'connect ECONNREFUSED 10.0.0.5:8080' });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await send();
    const failed = fake.calls.find((c) => c.table === 'campaign_sends' && c.op === 'update');
    expect(JSON.stringify(failed?.payload)).not.toContain('ECONNREFUSED');
    expect(failed?.payload).toMatchObject({ status: 'failed' });
    errSpy.mockRestore();
  });
});
