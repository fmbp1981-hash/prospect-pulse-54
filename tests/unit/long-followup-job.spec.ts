/**
 * F-11 — follow-up de longo prazo.
 *
 * Antes: o job enviava pela coluna followup_schedules.instance_name (inserível
 * pelo dono via REST → podia apontar para a instância de outra organização) e
 * buscava o lead com findByWhatsApp(schedule.lead_id, ...) (id de lead passado
 * como telefone).
 * Depois (F-11): lead = findByIdForUser(schedule.lead_id, schedule.user_id) e a
 * coluna instance_name é ignorada.
 * Sprint 2b (Task 5): o envio sai pela conexão de WhatsApp ativa da organização
 * do lead (getWhatsAppForOrganization); org sem conexão → não envia, marca
 * skipped e loga whatsapp_not_configured com organization_id (sem telefone).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakeSupabase, type FakeCall, type FakeResult } from './helpers/fake-supabase';
import type { OrgWhatsApp } from '@/lib/integrations/whatsapp/org-whatsapp';
import { ConnectionNotConfiguredError } from '@/lib/connectors/types';

const USER_A = '00000000-0000-0000-0000-00000000000a';
const USER_SEM_INST = '00000000-0000-0000-0000-00000000000c';
const LEAD_A = '60000000-0000-0000-0000-00000000000a';
const ORG_A = '0a0a0a0a-0000-0000-0000-00000000000a';
const ORG_SEM_WA = '0c0c0c0c-0000-0000-0000-00000000000c';

let schedules: Array<Record<string, unknown>> = [];

function handler(call: FakeCall): FakeResult | undefined {
  if (call.table === 'followup_schedules' && call.op === 'select') {
    return { data: schedules, error: null };
  }
  return undefined;
}
const fake = createFakeSupabase(handler);
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));

const mocks = vi.hoisted(() => ({
  findByIdForUser: vi.fn(),
  findByWhatsApp: vi.fn(),
  leadUpdate: vi.fn(async () => ({})),
  findOrgForUser: vi.fn(),
  sendMessageSequence: vi.fn(async () => ({ sent: 1 })),
  resolveLlm: vi.fn(),
  humanizeOrgs: [] as Array<string | undefined>,
}));

vi.mock('@/lib/repositories/lead.repository', () => ({
  leadRepository: {
    findByIdForUser: mocks.findByIdForUser,
    findByWhatsApp: mocks.findByWhatsApp,
    update: mocks.leadUpdate,
  },
}));
vi.mock('@/lib/repositories/connections.repository', () => ({
  connectionsRepository: { findOrganizationIdForUser: mocks.findOrgForUser },
}));
// Humanização pela conexão `llm` da organização do lead (Task 8): o mock
// registra a organização do contexto de LLM ativo em cada chamada.
vi.mock('@/lib/connectors/resolve-connection', () => ({ resolveConnection: mocks.resolveLlm }));
vi.mock('@/lib/services/message-humanizer.service', async () => {
  const { getCurrentLlm } = await import('@/lib/ai/openai-key-context');
  return {
    humanizeResponse: async (m: string) => {
      mocks.humanizeOrgs.push(getCurrentLlm().organizationId);
      return [`${m} (humanizada)`];
    },
  };
});
vi.mock('@/lib/utils/delay', () => ({ delay: async () => undefined }));
vi.mock('@/lib/services/long-followup-rules.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/long-followup-rules.service')>();
  return {
    ...actual,
    isWithinBusinessHours: () => true,
    detectFollowUpScenario: () => 'no_response_long',
  };
});

import { runLongFollowUpJob } from '@/lib/jobs/long-followup.job';
import { setWhatsAppProviderFactoryForTests } from '@/lib/integrations/whatsapp/org-whatsapp';

const factory = vi.fn(async (orgId: string): Promise<OrgWhatsApp> => {
  if (orgId === ORG_A) {
    return {
      provider: { sendMessageSequence: mocks.sendMessageSequence } as unknown as OrgWhatsApp['provider'],
      target: 'inst-org-a',
      connectionId: 'conn-a',
      organizationId: ORG_A,
    };
  }
  throw new ConnectionNotConfiguredError(orgId, 'whatsapp');
});

function schedule(userId: string, instanceName: string) {
  return {
    id: 'sched-1',
    lead_id: LEAD_A,
    scenario: 'no_response_long',
    step_number: 1,
    due_at: '2026-10-30T12:00:00Z',
    status: 'pending',
    instance_name: instanceName,
    user_id: userId,
  };
}

const LEAD = {
  id: LEAD_A,
  organization_id: ORG_A as string | null,
  user_id: USER_A,
  whatsapp: '+5581999990001',
  status_msg_wa: 'sent',
  estagio_pipeline: 'Contato Inicial',
  data_ultima_interacao: null,
  follow_up_count: 0,
};

beforeEach(() => {
  fake.calls.length = 0;
  vi.clearAllMocks();
  setWhatsAppProviderFactoryForTests(factory);
  mocks.findOrgForUser.mockImplementation(async (uid: string) => (uid === USER_A ? ORG_A : ORG_SEM_WA));
  mocks.findByIdForUser.mockImplementation(async (id: string, uid: string) =>
    id === LEAD_A && uid === USER_A ? LEAD : null
  );
  mocks.humanizeOrgs.length = 0;
  mocks.resolveLlm.mockImplementation(async (orgId: string, category: string) => {
    if (category !== 'llm') throw new Error(`categoria inesperada: ${category}`);
    return {
      id: 'llm-a',
      organizationId: orgId,
      category: 'llm',
      provider: 'openai',
      credentialSource: 'platform',
      config: {},
      secret: { apiKey: 'chave-teste' },
    };
  });
});
afterEach(() => setWhatsAppProviderFactoryForTests(null));

describe('F-11 — runLongFollowUpJob', () => {
  it('ignora instance_name da linha e envia pela conexão da organização do lead', async () => {
    schedules = [schedule(USER_A, 'inst-de-outra-org')];
    await runLongFollowUpJob();
    expect(factory).toHaveBeenCalledWith(ORG_A);
    expect(mocks.sendMessageSequence).toHaveBeenCalledTimes(1);
    expect(mocks.sendMessageSequence.mock.calls[0][0]).toBe('inst-org-a');
    const next = fake.calls.find((c) => c.table === 'followup_schedules' && c.op === 'insert');
    if (next) expect((next.payload as { instance_name: string }).instance_name).toBe('inst-org-a');
  });

  it('busca o lead por id + dono (não por telefone)', async () => {
    schedules = [schedule(USER_A, 'inst-org-a')];
    await runLongFollowUpJob();
    expect(mocks.findByIdForUser).toHaveBeenCalledWith(LEAD_A, USER_A);
    expect(mocks.findByWhatsApp).not.toHaveBeenCalled();
  });

  it('lead com organization_id nulo → usa a organização do dono', async () => {
    mocks.findByIdForUser.mockResolvedValueOnce({ ...LEAD, organization_id: null });
    schedules = [schedule(USER_A, 'inst-org-a')];
    await runLongFollowUpJob();
    expect(mocks.findOrgForUser).toHaveBeenCalledWith(USER_A);
    expect(factory).toHaveBeenCalledWith(ORG_A);
    expect(mocks.sendMessageSequence).toHaveBeenCalledTimes(1);
  });

  it('org sem conexão de WhatsApp → não envia, marca skipped e loga whatsapp_not_configured sem telefone', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.findByIdForUser.mockResolvedValueOnce({ ...LEAD, organization_id: ORG_SEM_WA, user_id: USER_SEM_INST });
    schedules = [schedule(USER_SEM_INST, 'inst-de-outra-org')];
    await runLongFollowUpJob();
    expect(mocks.sendMessageSequence).not.toHaveBeenCalled();
    const mark = fake.calls.find((c) => c.table === 'followup_schedules' && c.op === 'update');
    expect((mark?.payload as { status: string; skip_reason: string }).status).toBe('skipped');
    expect((mark?.payload as { skip_reason: string }).skip_reason).toBe('whatsapp_not_configured');
    const out = JSON.stringify(warn.mock.calls);
    expect(out).toContain('whatsapp_not_configured');
    expect(out).toContain(ORG_SEM_WA);
    expect(out).not.toContain('99999');
    warn.mockRestore();
  });

  it('humaniza no contexto de LLM da organização do lead', async () => {
    schedules = [schedule(USER_A, 'inst-org-a')];
    await runLongFollowUpJob();
    expect(mocks.resolveLlm).toHaveBeenCalledWith(ORG_A, 'llm', 'openai');
    expect(mocks.humanizeOrgs).toEqual([ORG_A]);
    expect((mocks.sendMessageSequence.mock.calls[0] as unknown[])[2]).toEqual([
      expect.stringContaining('(humanizada)'),
    ]);
  });

  it('org sem conexão llm → envia o texto do passo sem humanizar (não bloqueia)', async () => {
    mocks.resolveLlm.mockRejectedValue(new ConnectionNotConfiguredError(ORG_A, 'llm'));
    schedules = [schedule(USER_A, 'inst-org-a')];
    await runLongFollowUpJob();
    expect(mocks.humanizeOrgs).toEqual([]);
    expect(mocks.sendMessageSequence).toHaveBeenCalledTimes(1);
    const sent = (mocks.sendMessageSequence.mock.calls[0] as unknown[])[2] as string[];
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toContain('(humanizada)');
  });
});
