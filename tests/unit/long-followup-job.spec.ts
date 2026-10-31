/**
 * F-11 — follow-up de longo prazo.
 *
 * Antes: o job enviava pela coluna followup_schedules.instance_name (inserível
 * pelo dono via REST → podia apontar para a instância de outra organização) e
 * buscava o lead com findByWhatsApp(schedule.lead_id, ...) (id de lead passado
 * como telefone).
 * Agora: instância = resolveInstanceForUser(schedule.user_id) (coluna ignorada);
 * lead = findByIdForUser(schedule.lead_id, schedule.user_id).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeCall, type FakeResult } from './helpers/fake-supabase';

const USER_A = '00000000-0000-0000-0000-00000000000a';
const USER_SEM_INST = '00000000-0000-0000-0000-00000000000c';
const LEAD_A = '60000000-0000-0000-0000-00000000000a';

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
  resolveInstanceForUser: vi.fn(),
  sendMessageSequence: vi.fn(async () => ({ sent: 1 })),
}));

vi.mock('@/lib/repositories/lead.repository', () => ({
  leadRepository: {
    findByIdForUser: mocks.findByIdForUser,
    findByWhatsApp: mocks.findByWhatsApp,
    update: mocks.leadUpdate,
  },
}));
vi.mock('@/lib/services/tenant-resolver.service', () => ({
  resolveInstanceForUser: mocks.resolveInstanceForUser,
}));
vi.mock('@/lib/integrations/whatsapp/whatsapp.factory', () => ({
  getWhatsAppProvider: () => ({ sendMessageSequence: mocks.sendMessageSequence }),
}));
vi.mock('@/lib/services/message-humanizer.service', () => ({
  humanizeResponse: async (m: string) => [m],
}));
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
  mocks.resolveInstanceForUser.mockImplementation(async (uid: string) => (uid === USER_A ? 'inst-org-a' : null));
  mocks.findByIdForUser.mockImplementation(async (id: string, uid: string) =>
    id === LEAD_A && uid === USER_A ? LEAD : null
  );
});

describe('F-11 — runLongFollowUpJob', () => {
  it('ignora instance_name da linha e envia pela instância do dono', async () => {
    schedules = [schedule(USER_A, 'inst-de-outra-org')];
    await runLongFollowUpJob();
    expect(mocks.resolveInstanceForUser).toHaveBeenCalledWith(USER_A);
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

  it('dono sem instância configurada → não envia e marca skipped', async () => {
    mocks.findByIdForUser.mockResolvedValueOnce({ ...LEAD, user_id: USER_SEM_INST });
    schedules = [schedule(USER_SEM_INST, 'inst-de-outra-org')];
    await runLongFollowUpJob();
    expect(mocks.sendMessageSequence).not.toHaveBeenCalled();
    const mark = fake.calls.find((c) => c.table === 'followup_schedules' && c.op === 'update');
    expect((mark?.payload as { status: string }).status).toBe('skipped');
  });
});
