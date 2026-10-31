/**
 * inbox/send-message e inbox/takeover — envio pela conexão de WhatsApp da organização.
 *
 * Histórico: F-12 — caíam para a instância global (EVOLUTION_INSTANCE_NAME) e a
 * mensagem saía pelo número de outra organização.
 * Sprint 2b (Task 5): a organização vem de resolveOrganizationIdForUser(user.id)
 * e o lead tem de ser dessa organização (senão 404). O envio sai pela conexão
 * ativa da organização (getWhatsAppForOrganization); sem conexão, send-message
 * responde 409 WHATSAPP_NOT_CONFIGURED e o takeover troca o modo sem enviar nada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, type FakeCall, type FakeResult } from './helpers/fake-supabase';
import type { OrgWhatsApp } from '@/lib/integrations/whatsapp/org-whatsapp';
import { ConnectionNotConfiguredError } from '@/lib/connectors/types';

const USER_A = '00000000-0000-0000-0000-00000000000a';
const ORG_A = '0a0a0a0a-0000-0000-0000-00000000000a';
const ORG_B = '0b0b0b0b-0000-0000-0000-00000000000b';
const ORG_SEM_WA = '0c0c0c0c-0000-0000-0000-00000000000c';
const LEAD = '60000000-0000-0000-0000-000000000001';

let currentUser: { id: string; email: string; user_metadata: Record<string, unknown> } = {
  id: USER_A,
  email: 'a@exemplo.com',
  user_metadata: {},
};
let leadOrg: string | null = ORG_A;

function handler(call: FakeCall): FakeResult | undefined {
  if (call.table === 'leads_prospeccao' && call.op === 'select') {
    return {
      data: {
        id: LEAD,
        whatsapp: '+55 81 99999-0001',
        user_id: currentUser.id,
        organization_id: leadOrg,
        modo_atendimento: 'bot',
        data_ultima_acao_consultor: null,
      },
      error: null,
    };
  }
  return undefined;
}
const fake = createFakeSupabase(handler);

const mocks = vi.hoisted(() => ({
  sendText: vi.fn(),
  findOrgForUser: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: currentUser } }) } }),
}));
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [] }) }));
// RBAC (F-13) é coberto em require-writer.spec.ts / viewer-write-routes.spec.ts.
vi.mock('@/lib/auth/require-writer', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/require-writer')>()),
  requireWriter: async () => true,
}));
vi.mock('@/lib/repositories/connections.repository', () => ({
  connectionsRepository: { findOrganizationIdForUser: mocks.findOrgForUser },
}));

import { POST as sendMessage } from '../../app/api/inbox/send-message/route';
import { POST as takeover } from '../../app/api/inbox/takeover/route';
import { setWhatsAppProviderFactoryForTests } from '@/lib/integrations/whatsapp/org-whatsapp';

const factory = vi.fn(async (orgId: string): Promise<OrgWhatsApp> => {
  if (orgId === ORG_A || orgId === ORG_B) {
    return {
      provider: { sendText: mocks.sendText } as unknown as OrgWhatsApp['provider'],
      target: orgId === ORG_A ? 'inst-org-a' : 'inst-org-b',
      connectionId: `conn-${orgId}`,
      organizationId: orgId,
    };
  }
  throw new ConnectionNotConfiguredError(orgId, 'whatsapp');
});

function post(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  fake.calls.length = 0;
  vi.clearAllMocks();
  setWhatsAppProviderFactoryForTests(factory);
  process.env.EVOLUTION_INSTANCE_NAME = 'inst-global-de-outra-org';
  mocks.findOrgForUser.mockResolvedValue(ORG_A);
  mocks.sendText.mockResolvedValue({ success: true, messageId: 'm1' });
  leadOrg = ORG_A;
  currentUser = { id: USER_A, email: 'a@exemplo.com', user_metadata: {} };
});
afterEach(() => setWhatsAppProviderFactoryForTests(null));

describe('inbox/send-message', () => {
  it('envia pela conexão da organização do lead e grava o histórico', async () => {
    const res = await sendMessage(post('http://x/api/inbox/send-message', { leadId: LEAD, message: 'oi' }));
    expect(res.status).toBe(200);
    expect(mocks.findOrgForUser).toHaveBeenCalledWith(USER_A);
    expect(factory).toHaveBeenCalledWith(ORG_A);
    expect(mocks.sendText).toHaveBeenCalledWith('inst-org-a', '5581999990001', 'oi');
    expect(fake.calls.some((c) => c.table === 'whatsapp_conversations' && c.op === 'insert')).toBe(true);
  });

  it('lead de outra organização → 404 e nada enviado', async () => {
    leadOrg = ORG_B;
    const res = await sendMessage(post('http://x/api/inbox/send-message', { leadId: LEAD, message: 'oi' }));
    expect(res.status).toBe(404);
    expect(factory).not.toHaveBeenCalled();
    expect(mocks.sendText).not.toHaveBeenCalled();
    expect(fake.calls.some((c) => c.op === 'insert')).toBe(false);
  });

  it('organização sem conexão → 409 WHATSAPP_NOT_CONFIGURED e nada enviado (sem fallback global)', async () => {
    mocks.findOrgForUser.mockResolvedValue(ORG_SEM_WA);
    leadOrg = ORG_SEM_WA;
    const res = await sendMessage(post('http://x/api/inbox/send-message', { leadId: LEAD, message: 'oi' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: {
        code: 'WHATSAPP_NOT_CONFIGURED',
        message: 'WhatsApp não configurado para esta organização. Fale com a equipe IntelliX.',
      },
    });
    expect(mocks.sendText).not.toHaveBeenCalled();
    expect(fake.calls.some((c) => c.op === 'insert')).toBe(false);
  });

  it('usuário sem organização → 409 e nada enviado', async () => {
    mocks.findOrgForUser.mockResolvedValue(null);
    leadOrg = null;
    const res = await sendMessage(post('http://x/api/inbox/send-message', { leadId: LEAD, message: 'oi' }));
    expect(res.status).toBe(409);
    expect(factory).not.toHaveBeenCalled();
    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it('envio falhou no provedor → 502 sem gravar histórico', async () => {
    mocks.sendText.mockResolvedValue({ success: false, error: 'HTTP 500 detalhe interno' });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await sendMessage(post('http://x/api/inbox/send-message', { leadId: LEAD, message: 'oi' }));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain('detalhe interno');
    expect(fake.calls.some((c) => c.op === 'insert')).toBe(false);
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain('99999');
    errSpy.mockRestore();
  });

  it('corpo inválido → 400', async () => {
    const res = await sendMessage(post('http://x/api/inbox/send-message', { leadId: LEAD, message: '   ' }));
    expect(res.status).toBe(400);
    expect(mocks.sendText).not.toHaveBeenCalled();
  });
});

describe('inbox/takeover', () => {
  it('organização sem conexão → assume a conversa mas não envia nada', async () => {
    mocks.findOrgForUser.mockResolvedValue(ORG_SEM_WA);
    leadOrg = ORG_SEM_WA;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = await takeover(post('http://x/api/inbox/takeover', { leadId: LEAD }));
    expect(res.status).toBe(200);
    expect(mocks.sendText).not.toHaveBeenCalled();
    const upd = fake.calls.find((c) => c.table === 'leads_prospeccao' && c.op === 'update');
    expect((upd?.payload as { modo_atendimento: string }).modo_atendimento).toBe('humano');
    expect(JSON.stringify(warn.mock.calls)).toContain('whatsapp_not_configured');
    warn.mockRestore();
  });

  it('notifica pela conexão da organização do lead', async () => {
    const res = await takeover(post('http://x/api/inbox/takeover', { leadId: LEAD }));
    expect(res.status).toBe(200);
    expect(factory).toHaveBeenCalledWith(ORG_A);
    expect(mocks.sendText).toHaveBeenCalledTimes(1);
    expect(mocks.sendText.mock.calls[0][0]).toBe('inst-org-a');
  });

  it('lead de outra organização → 404 sem alterar o lead nem enviar', async () => {
    leadOrg = ORG_B;
    const res = await takeover(post('http://x/api/inbox/takeover', { leadId: LEAD }));
    expect(res.status).toBe(404);
    expect(mocks.sendText).not.toHaveBeenCalled();
    expect(fake.calls.some((c) => c.op === 'update')).toBe(false);
  });
});
