/**
 * FOLLOW-UP POR FILA (Cloudflare Queue) — o cron só reivindica os leads e
 * despacha uma mensagem por lead; o consumidor processa cada mensagem
 * isoladamente (relendo o lead, conferindo o follow_up_count e enviando pela
 * conexão de WhatsApp da organização).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConnectionNotConfiguredError } from '@/lib/connectors/types';

const mocks = vi.hoisted(() => ({
  claimDueFollowUps: vi.fn(),
  releaseFollowUpClaim: vi.fn(),
  incrementFollowUpCount: vi.fn(),
  findById: vi.fn(),
  reserveFollowUpSend: vi.fn(),
  revertFollowUpReservation: vi.fn(),
  getWhatsAppForOrganization: vi.fn(),
  resolveLeadOrganizationId: vi.fn(),
  sendText: vi.fn(),
}));

vi.mock('@/lib/repositories/lead.repository', () => ({
  leadRepository: {
    claimDueFollowUps: mocks.claimDueFollowUps,
    releaseFollowUpClaim: mocks.releaseFollowUpClaim,
    incrementFollowUpCount: mocks.incrementFollowUpCount,
    findById: mocks.findById,
    reserveFollowUpSend: mocks.reserveFollowUpSend,
    revertFollowUpReservation: mocks.revertFollowUpReservation,
  },
}));
vi.mock('@/lib/integrations/whatsapp/org-whatsapp', () => ({
  getWhatsAppForOrganization: mocks.getWhatsAppForOrganization,
}));
vi.mock('@/lib/connectors/org-context', () => ({
  resolveLeadOrganizationId: mocks.resolveLeadOrganizationId,
}));

import {
  dispatchDueFollowUps,
  isStillDueForFollowUp,
  processFollowUpMessage,
} from '@/lib/jobs/follow-up.queue';

const ORG = '0a0a0a0a-0000-0000-0000-00000000000a';
const LEAD_1 = '11111111-1111-4111-8111-111111111111';
const LEAD_2 = '22222222-2222-4222-8222-222222222222';
const PHONE = '+5581999990001';

const OLD = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

function lead(id: string, followUpCount: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    organization_id: ORG,
    user_id: null,
    whatsapp: PHONE,
    follow_up_count: followUpCount,
    modo_atendimento: 'bot',
    status_msg_wa: 'Em Conversa',
    data_ultima_interacao: OLD,
    ...overrides,
  };
}

describe('follow-up por fila', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.releaseFollowUpClaim.mockResolvedValue(undefined);
    mocks.incrementFollowUpCount.mockResolvedValue(undefined);
    mocks.reserveFollowUpSend.mockResolvedValue(true);
    mocks.revertFollowUpReservation.mockResolvedValue(true);
    mocks.resolveLeadOrganizationId.mockResolvedValue(ORG);
    mocks.getWhatsAppForOrganization.mockResolvedValue({
      provider: { sendText: mocks.sendText },
      target: 'inst-org',
      connectionId: 'conn',
      organizationId: ORG,
    });
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation(() => undefined);
    }
  });
  afterEach(() => vi.restoreAllMocks());

  describe('dispatchDueFollowUps', () => {
    it('dispatches one message per claimed lead', async () => {
      mocks.claimDueFollowUps.mockResolvedValue([lead(LEAD_1, 0), lead(LEAD_2, 1)]);
      const sendBatch = vi.fn().mockResolvedValue(undefined);

      const count = await dispatchDueFollowUps({ sendBatch });

      expect(count).toBe(2);
      expect(mocks.claimDueFollowUps).toHaveBeenCalledWith(100);
      expect(sendBatch).toHaveBeenCalledTimes(1);
      expect(sendBatch).toHaveBeenCalledWith([
        { body: { leadId: LEAD_1, followUpCount: 0 } },
        { body: { leadId: LEAD_2, followUpCount: 1 } },
      ]);
    });

    it('releases claims when sendBatch throws', async () => {
      mocks.claimDueFollowUps.mockResolvedValue([lead(LEAD_1, 0), lead(LEAD_2, 1)]);
      const sendBatch = vi.fn().mockRejectedValue(new Error('queue down'));

      await expect(dispatchDueFollowUps({ sendBatch })).rejects.toThrow('queue down');

      expect(mocks.releaseFollowUpClaim).toHaveBeenCalledTimes(2);
      expect(mocks.releaseFollowUpClaim).toHaveBeenCalledWith(LEAD_1);
      expect(mocks.releaseFollowUpClaim).toHaveBeenCalledWith(LEAD_2);
    });

    it('logs rejected releases (leadId + error message only)', async () => {
      mocks.claimDueFollowUps.mockResolvedValue([lead(LEAD_1, 0), lead(LEAD_2, 1)]);
      mocks.releaseFollowUpClaim.mockImplementation(async (id: string) => {
        if (id === LEAD_1) throw new Error('db down');
      });
      const sendBatch = vi.fn().mockRejectedValue(new Error('queue down'));

      await expect(dispatchDueFollowUps({ sendBatch })).rejects.toThrow('queue down');

      const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
      expect(logged).toContain(LEAD_1);
      expect(logged).toContain('db down');
      expect(logged).not.toContain(LEAD_2);
      expect(logged).not.toContain(PHONE);
    });

    it('does not call sendBatch when nothing is due', async () => {
      mocks.claimDueFollowUps.mockResolvedValue([]);
      const sendBatch = vi.fn();

      await expect(dispatchDueFollowUps({ sendBatch })).resolves.toBe(0);
      expect(sendBatch).not.toHaveBeenCalled();
    });
  });

  describe('processFollowUpMessage', () => {
    it('skips when lead does not exist', async () => {
      mocks.findById.mockResolvedValue(null);

      await expect(processFollowUpMessage({ leadId: LEAD_1, followUpCount: 0 })).resolves.toBe('skipped');
      expect(mocks.sendText).not.toHaveBeenCalled();
    });

    it('skips when follow_up_count advanced', async () => {
      mocks.findById.mockResolvedValue(lead(LEAD_1, 1));

      await expect(processFollowUpMessage({ leadId: LEAD_1, followUpCount: 0 })).resolves.toBe('skipped');
      expect(mocks.sendText).not.toHaveBeenCalled();
      expect(mocks.incrementFollowUpCount).not.toHaveBeenCalled();
    });

    it('sends after reservation without separate increment', async () => {
      mocks.findById.mockResolvedValue(lead(LEAD_1, 0));
      mocks.sendText.mockResolvedValue({ success: true });

      await expect(processFollowUpMessage({ leadId: LEAD_1, followUpCount: 0 })).resolves.toBe('sent');
      expect(mocks.findById).toHaveBeenCalledWith(LEAD_1);
      expect(mocks.reserveFollowUpSend).toHaveBeenCalledWith(LEAD_1, 0, expect.any(Date));
      expect(mocks.reserveFollowUpSend.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.sendText.mock.invocationCallOrder[0]
      );
      expect(mocks.sendText).toHaveBeenCalledWith('inst-org', PHONE, expect.any(String));
      expect(mocks.incrementFollowUpCount).not.toHaveBeenCalled();
      expect(mocks.revertFollowUpReservation).not.toHaveBeenCalled();
      expect(mocks.releaseFollowUpClaim).not.toHaveBeenCalled();
    });

    it('skips when reservation fails', async () => {
      mocks.findById.mockResolvedValue(lead(LEAD_1, 0));
      mocks.reserveFollowUpSend.mockResolvedValue(false);

      await expect(processFollowUpMessage({ leadId: LEAD_1, followUpCount: 0 })).resolves.toBe('skipped');
      expect(mocks.sendText).not.toHaveBeenCalled();
      expect(mocks.releaseFollowUpClaim).not.toHaveBeenCalled();
    });

    it('reverts reservation and retries on send failure', async () => {
      const l = lead(LEAD_1, 2, { status_msg_wa: 'Qualificando' });
      mocks.findById.mockResolvedValue(l);
      mocks.sendText.mockResolvedValue({ success: false, error: 'HTTP 500' });

      await expect(processFollowUpMessage({ leadId: LEAD_1, followUpCount: 2 })).resolves.toBe('retry');
      expect(mocks.incrementFollowUpCount).not.toHaveBeenCalled();
      const reservedAt = mocks.reserveFollowUpSend.mock.calls[0][2] as Date;
      expect(mocks.revertFollowUpReservation).toHaveBeenCalledWith(LEAD_1, 2, {
        reservedAt,
        status_msg_wa: 'Qualificando',
        data_ultima_interacao: OLD,
      });
      // a trava de 5 min do claim segura o lead enquanto a fila tenta de novo
      expect(mocks.releaseFollowUpClaim).not.toHaveBeenCalled();
    });

    it('reverts reservation and retries when send throws', async () => {
      mocks.findById.mockResolvedValue(lead(LEAD_1, 0));
      mocks.sendText.mockRejectedValue(new Error('network down'));

      await expect(processFollowUpMessage({ leadId: LEAD_1, followUpCount: 0 })).resolves.toBe('retry');
      expect(mocks.revertFollowUpReservation).toHaveBeenCalledTimes(1);
      expect(mocks.incrementFollowUpCount).not.toHaveBeenCalled();
    });

    it.each([
      ['modo_atendimento humano', { modo_atendimento: 'humano' }],
      ['status_msg_wa fora da conversa', { status_msg_wa: 'Follow-up' }],
      ['interação recente', { data_ultima_interacao: new Date().toISOString() }],
    ])('skips when lead no longer qualifies: %s', async (_l, overrides) => {
      mocks.findById.mockResolvedValue(lead(LEAD_1, 0, overrides));

      await expect(processFollowUpMessage({ leadId: LEAD_1, followUpCount: 0 })).resolves.toBe('skipped');
      expect(mocks.sendText).not.toHaveBeenCalled();
      expect(mocks.reserveFollowUpSend).not.toHaveBeenCalled();
      expect(mocks.releaseFollowUpClaim).not.toHaveBeenCalled();
    });

    it('skips without whatsapp connection', async () => {
      mocks.findById.mockResolvedValue(lead(LEAD_1, 0));
      mocks.getWhatsAppForOrganization.mockRejectedValue(new ConnectionNotConfiguredError(ORG, 'whatsapp'));

      await expect(processFollowUpMessage({ leadId: LEAD_1, followUpCount: 0 })).resolves.toBe('skipped');
      expect(mocks.sendText).not.toHaveBeenCalled();
      expect(mocks.releaseFollowUpClaim).toHaveBeenCalledWith(LEAD_1);
    });

    it('skips without organization', async () => {
      mocks.findById.mockResolvedValue(lead(LEAD_1, 0));
      mocks.resolveLeadOrganizationId.mockResolvedValue(null);

      await expect(processFollowUpMessage({ leadId: LEAD_1, followUpCount: 0 })).resolves.toBe('skipped');
      expect(mocks.releaseFollowUpClaim).toHaveBeenCalledWith(LEAD_1);
    });
  });

  describe('isStillDueForFollowUp', () => {
    const now = new Date('2026-11-01T12:00:00.000Z');
    const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();
    const base = { modo_atendimento: 'bot', status_msg_wa: 'Qualificando' };

    it.each([
      [0, 15, true],
      [0, 14, false],
      [1, 60, true],
      [1, 59, false],
      [2, 1440, true],
      [2, 1439, false],
    ])('count %i, %i min sem interação → %s', (count, minutes, expected) => {
      expect(
        isStillDueForFollowUp({ ...base, follow_up_count: count, data_ultima_interacao: minutesAgo(minutes) }, now)
      ).toBe(expected);
    });

    it('false sem data_ultima_interacao ou com count fora das janelas', () => {
      expect(isStillDueForFollowUp({ ...base, follow_up_count: 0, data_ultima_interacao: null }, now)).toBe(false);
      expect(isStillDueForFollowUp({ ...base, follow_up_count: 3, data_ultima_interacao: minutesAgo(5000) }, now)).toBe(false);
    });
  });
});
