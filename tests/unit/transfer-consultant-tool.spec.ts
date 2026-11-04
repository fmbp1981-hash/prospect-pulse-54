/**
 * transferir_para_consultor — a notificação ao consultor sai pela conexão de
 * WhatsApp da organização do lead (Sprint 2b, Task 5), nunca por instância de
 * user_settings ou de variável de ambiente. Sem conexão: o lead é transferido
 * (db_ok) mas a notificação não sai (msg_ok=false) e o log leva só
 * organization_id + código.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakeSupabase, type FakeCall, type FakeResult } from './helpers/fake-supabase';
import type { OrgWhatsApp } from '@/lib/integrations/whatsapp/org-whatsapp';
import { ConnectionNotConfiguredError } from '@/lib/connectors/types';

const USER_A = '00000000-0000-0000-0000-00000000000a';
const ORG_A = '0a0a0a0a-0000-0000-0000-00000000000a';
const ORG_SEM_WA = '0c0c0c0c-0000-0000-0000-00000000000c';
const CONSULTOR = '+55 81 98888-7777';

let consultantWhatsapp: string | null = CONSULTOR;
const fake = createFakeSupabase((call: FakeCall): FakeResult | undefined => {
  if (call.table === 'user_settings' && call.op === 'select') {
    return { data: { consultant_whatsapp: consultantWhatsapp, evolution_instance_name: 'inst-legada' }, error: null };
  }
  return undefined;
});
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));

const mocks = vi.hoisted(() => ({
  findByWhatsApp: vi.fn(),
  update: vi.fn(async () => ({})),
  findOrgForUser: vi.fn(),
  sendText: vi.fn(),
}));
vi.mock('@/lib/repositories/lead.repository', () => ({
  leadRepository: { findByWhatsApp: mocks.findByWhatsApp, update: mocks.update },
}));
vi.mock('@/lib/repositories/connections.repository', () => ({
  connectionsRepository: { findOrganizationIdForUser: mocks.findOrgForUser },
}));

import { transferConsultantTool } from '@/lib/ai/tools/transfer-consultant.tool';
import { setWhatsAppProviderFactoryForTests } from '@/lib/integrations/whatsapp/org-whatsapp';

const factory = vi.fn(async (orgId: string): Promise<OrgWhatsApp> => {
  if (orgId === ORG_A) {
    return {
      provider: { sendText: mocks.sendText } as unknown as OrgWhatsApp['provider'],
      target: 'inst-org-a',
      connectionId: 'conn-a',
      organizationId: ORG_A,
    };
  }
  throw new ConnectionNotConfiguredError(orgId, 'whatsapp');
});

const CTX = {
  leadId: 'lead-1',
  whatsapp: '+5581999990001',
  instanceName: 'inst-do-payload',
  userId: USER_A,
};

beforeEach(() => {
  vi.clearAllMocks();
  fake.calls.length = 0;
  consultantWhatsapp = CONSULTOR;
  setWhatsAppProviderFactoryForTests(factory);
  mocks.findByWhatsApp.mockResolvedValue({
    id: 'lead-1',
    lead: 'Fulano',
    empresa: 'ACME',
    estagio_pipeline: 'Qualificado',
    organization_id: ORG_A,
    user_id: USER_A,
  });
  mocks.findOrgForUser.mockResolvedValue(ORG_A);
  mocks.sendText.mockResolvedValue({ success: true });
});
afterEach(() => setWhatsAppProviderFactoryForTests(null));

describe('transferir_para_consultor', () => {
  it('notifica o consultor pela conexão da organização do lead', async () => {
    const r = await transferConsultantTool.execute({ motivo: 'quer proposta' }, CTX);
    expect(r).toEqual({ success: true, details: { db_ok: true, msg_ok: true } });
    expect(factory).toHaveBeenCalledWith(ORG_A);
    expect(mocks.sendText).toHaveBeenCalledWith('inst-org-a', '5581988887777', expect.stringContaining('ACME'));
  });

  it('lead com organization_id nulo → usa a organização do dono', async () => {
    mocks.findByWhatsApp.mockResolvedValue({ id: 'lead-1', organization_id: null, user_id: USER_A });
    await transferConsultantTool.execute({}, CTX);
    expect(mocks.findOrgForUser).toHaveBeenCalledWith(USER_A);
    expect(factory).toHaveBeenCalledWith(ORG_A);
  });

  it('org sem conexão → transfere (db_ok) mas não notifica; log sem telefone', async () => {
    mocks.findByWhatsApp.mockResolvedValue({ id: 'lead-1', organization_id: ORG_SEM_WA, user_id: USER_A });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const r = await transferConsultantTool.execute({}, CTX);
    expect(r).toMatchObject({ success: true, details: { db_ok: true, msg_ok: false } });
    expect(mocks.update).toHaveBeenCalled();
    expect(mocks.sendText).not.toHaveBeenCalled();
    const out = JSON.stringify(warn.mock.calls);
    expect(out).toContain('whatsapp_not_configured');
    expect(out).toContain(ORG_SEM_WA);
    expect(out).not.toContain('99999');
    expect(out).not.toContain('98888');
    warn.mockRestore();
  });

  it('sem WhatsApp do consultor → não envia', async () => {
    consultantWhatsapp = null;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const r = await transferConsultantTool.execute({}, CTX);
    expect(r).toMatchObject({ details: { db_ok: true, msg_ok: false } });
    expect(mocks.sendText).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('envio falhou → msg_ok false e log sem o detalhe do provedor nem telefone', async () => {
    mocks.sendText.mockResolvedValue({ success: false, error: 'HTTP 500 5581988887777' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const r = await transferConsultantTool.execute({}, CTX);
    expect(r).toMatchObject({ details: { db_ok: true, msg_ok: false } });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('98888');
    warn.mockRestore();
  });
});
