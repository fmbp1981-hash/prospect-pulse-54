/**
 * FOLLOW-UP JOB — envio pela instância de cada organização + trava atômica.
 * O job reivindica os leads via claimDueFollowUps (trava no banco), resolve a
 * instância Evolution pelo dono do lead e, quando não envia, libera a trava.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockClaimDueFollowUps,
  mockReleaseFollowUpClaim,
  mockIncrementFollowUpCount,
  mockResolveInstanceForUser,
  mockSendWhatsAppText,
} = vi.hoisted(() => ({
  mockClaimDueFollowUps: vi.fn(),
  mockReleaseFollowUpClaim: vi.fn(),
  mockIncrementFollowUpCount: vi.fn(),
  mockResolveInstanceForUser: vi.fn(),
  mockSendWhatsAppText: vi.fn(),
}));

vi.mock('@/lib/repositories/lead.repository', () => ({
  leadRepository: {
    claimDueFollowUps: mockClaimDueFollowUps,
    releaseFollowUpClaim: mockReleaseFollowUpClaim,
    incrementFollowUpCount: mockIncrementFollowUpCount,
  },
}));

vi.mock('@/lib/services/tenant-resolver.service', () => ({
  resolveInstanceForUser: mockResolveInstanceForUser,
}));

vi.mock('@/lib/integrations/evolution/messaging.client', () => ({
  sendWhatsAppText: mockSendWhatsAppText,
}));

import { runFollowUpJob } from '@/lib/jobs/follow-up.job';

const USER_A = '00000000-0000-0000-0000-00000000000a';
const USER_SEM_INST = '00000000-0000-0000-0000-00000000000b';

function lead(id: string, userId: string | null, whatsapp = '+5581999990001') {
  return {
    id,
    user_id: userId,
    whatsapp,
    follow_up_count: 0,
  };
}

// Leads sem envio voltam pelo releaseFollowUpClaim (backoff de 15 min no repositório;
// ver tests/unit/follow-up-claim-repository.spec.ts).
describe('runFollowUpJob — trava atômica e instância por organização', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReleaseFollowUpClaim.mockResolvedValue(undefined);
    mockIncrementFollowUpCount.mockResolvedValue(undefined);
    mockResolveInstanceForUser.mockImplementation(async (userId: string) =>
      userId === USER_A ? 'inst-org-a' : null
    );
  });

  it('reivindica no máximo 20 leads por execução', async () => {
    mockClaimDueFollowUps.mockResolvedValue([]);

    await runFollowUpJob({ delayMs: 0 });

    expect(mockClaimDueFollowUps).toHaveBeenCalledWith(20);
    expect(mockSendWhatsAppText).not.toHaveBeenCalled();
  });

  it('envia pela instância da organização do lead e incrementa no sucesso', async () => {
    mockClaimDueFollowUps.mockResolvedValue([lead('lead-ok', USER_A)]);
    mockSendWhatsAppText.mockResolvedValue({ success: true });

    await runFollowUpJob({ delayMs: 0 });

    expect(mockResolveInstanceForUser).toHaveBeenCalledWith(USER_A);
    expect(mockSendWhatsAppText).toHaveBeenCalledWith(
      expect.objectContaining({ instanceName: 'inst-org-a', to: '+5581999990001' })
    );
    expect(mockIncrementFollowUpCount).toHaveBeenCalledWith('lead-ok');
    expect(mockReleaseFollowUpClaim).not.toHaveBeenCalled();
  });

  it('nunca usa instância vinda de variável de ambiente', async () => {
    process.env.EVOLUTION_DEFAULT_INSTANCE = 'inst-env';
    mockClaimDueFollowUps.mockResolvedValue([lead('lead-sem-inst', USER_SEM_INST)]);

    await runFollowUpJob({ delayMs: 0 });

    expect(mockSendWhatsAppText).not.toHaveBeenCalled();
    delete process.env.EVOLUTION_DEFAULT_INSTANCE;
  });

  it('sem instância configurada: não envia e libera a trava', async () => {
    mockClaimDueFollowUps.mockResolvedValue([lead('lead-sem-inst', USER_SEM_INST)]);

    await runFollowUpJob({ delayMs: 0 });

    expect(mockSendWhatsAppText).not.toHaveBeenCalled();
    expect(mockReleaseFollowUpClaim).toHaveBeenCalledWith('lead-sem-inst');
    expect(mockIncrementFollowUpCount).not.toHaveBeenCalled();
  });

  it('lead sem dono (user_id nulo): não envia e libera a trava', async () => {
    mockClaimDueFollowUps.mockResolvedValue([lead('lead-sem-dono', null)]);

    await runFollowUpJob({ delayMs: 0 });

    expect(mockResolveInstanceForUser).not.toHaveBeenCalled();
    expect(mockSendWhatsAppText).not.toHaveBeenCalled();
    expect(mockReleaseFollowUpClaim).toHaveBeenCalledWith('lead-sem-dono');
  });

  it('envio falhou: libera a trava e não incrementa', async () => {
    mockClaimDueFollowUps.mockResolvedValue([lead('lead-falha', USER_A)]);
    mockSendWhatsAppText.mockResolvedValue({ success: false, error: 'HTTP 500' });

    await runFollowUpJob({ delayMs: 0 });

    expect(mockReleaseFollowUpClaim).toHaveBeenCalledWith('lead-falha');
    expect(mockIncrementFollowUpCount).not.toHaveBeenCalledWith('lead-falha');
  });

  it('envio lançou exceção: libera a trava e segue para o próximo lead', async () => {
    mockClaimDueFollowUps.mockResolvedValue([
      lead('lead-falha', USER_A),
      lead('lead-ok', USER_A, '+5581999990002'),
    ]);
    mockSendWhatsAppText
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ success: true });

    await runFollowUpJob({ delayMs: 0 });

    expect(mockReleaseFollowUpClaim).toHaveBeenCalledWith('lead-falha');
    expect(mockIncrementFollowUpCount).not.toHaveBeenCalledWith('lead-falha');
    expect(mockIncrementFollowUpCount).toHaveBeenCalledWith('lead-ok');
  });

  it('envio ok mas incrementFollowUpCount lançou: NÃO devolve o lead (evita reenvio imediato)', async () => {
    mockClaimDueFollowUps.mockResolvedValue([lead('lead-ok-inc-falhou', USER_A)]);
    mockSendWhatsAppText.mockResolvedValue({ success: true });
    mockIncrementFollowUpCount.mockRejectedValueOnce(new Error('db down'));

    await expect(runFollowUpJob({ delayMs: 0 })).resolves.toBeUndefined();

    expect(mockSendWhatsAppText).toHaveBeenCalledTimes(1);
    expect(mockReleaseFollowUpClaim).not.toHaveBeenCalledWith('lead-ok-inc-falhou');
    expect(mockReleaseFollowUpClaim).not.toHaveBeenCalled();
  });

  it('mistura de leads: cada um segue seu caminho', async () => {
    mockClaimDueFollowUps.mockResolvedValue([
      lead('lead-ok', USER_A),
      lead('lead-sem-inst', USER_SEM_INST),
      lead('lead-falha', USER_A, '+5581999990003'),
    ]);
    mockSendWhatsAppText.mockImplementation(async (opts: { to: string }) =>
      opts.to === '+5581999990003' ? { success: false, error: 'x' } : { success: true }
    );

    await runFollowUpJob({ delayMs: 0 });

    expect(mockSendWhatsAppText).toHaveBeenCalledTimes(2);
    for (const call of mockSendWhatsAppText.mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({ instanceName: 'inst-org-a' }));
    }
    expect(mockIncrementFollowUpCount).toHaveBeenCalledWith('lead-ok');
    expect(mockIncrementFollowUpCount).toHaveBeenCalledTimes(1);
    expect(mockReleaseFollowUpClaim).toHaveBeenCalledWith('lead-sem-inst');
    expect(mockReleaseFollowUpClaim).toHaveBeenCalledWith('lead-falha');
  });
});
