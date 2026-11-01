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
  },
}));
vi.mock('@/lib/integrations/whatsapp/org-whatsapp', () => ({
  getWhatsAppForOrganization: mocks.getWhatsAppForOrganization,
}));
vi.mock('@/lib/connectors/org-context', () => ({
  resolveLeadOrganizationId: mocks.resolveLeadOrganizationId,
}));

import { dispatchDueFollowUps, processFollowUpMessage } from '@/lib/jobs/follow-up.queue';

const ORG = '0a0a0a0a-0000-0000-0000-00000000000a';
const LEAD_1 = '11111111-1111-4111-8111-111111111111';
const LEAD_2 = '22222222-2222-4222-8222-222222222222';
const PHONE = '+5581999990001';

function lead(id: string, followUpCount: number) {
  return { id, organization_id: ORG, user_id: null, whatsapp: PHONE, follow_up_count: followUpCount };
}

describe('follow-up por fila', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.releaseFollowUpClaim.mockResolvedValue(undefined);
    mocks.incrementFollowUpCount.mockResolvedValue(undefined);
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

    it('sends and increments', async () => {
      mocks.findById.mockResolvedValue(lead(LEAD_1, 0));
      mocks.sendText.mockResolvedValue({ success: true });

      await expect(processFollowUpMessage({ leadId: LEAD_1, followUpCount: 0 })).resolves.toBe('sent');
      expect(mocks.findById).toHaveBeenCalledWith(LEAD_1);
      expect(mocks.sendText).toHaveBeenCalledWith('inst-org', PHONE, expect.any(String));
      expect(mocks.incrementFollowUpCount).toHaveBeenCalledWith(LEAD_1);
      expect(mocks.releaseFollowUpClaim).not.toHaveBeenCalled();
    });

    it('returns retry on send failure', async () => {
      mocks.findById.mockResolvedValue(lead(LEAD_1, 0));
      mocks.sendText.mockResolvedValue({ success: false, error: 'HTTP 500' });

      await expect(processFollowUpMessage({ leadId: LEAD_1, followUpCount: 0 })).resolves.toBe('retry');
      expect(mocks.incrementFollowUpCount).not.toHaveBeenCalled();
      // a trava de 5 min do claim segura o lead enquanto a fila tenta de novo
      expect(mocks.releaseFollowUpClaim).not.toHaveBeenCalled();
    });

    it('returns retry when send throws', async () => {
      mocks.findById.mockResolvedValue(lead(LEAD_1, 0));
      mocks.sendText.mockRejectedValue(new Error('network down'));

      await expect(processFollowUpMessage({ leadId: LEAD_1, followUpCount: 0 })).resolves.toBe('retry');
      expect(mocks.incrementFollowUpCount).not.toHaveBeenCalled();
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
});
