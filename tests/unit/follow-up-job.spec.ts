/**
 * FOLLOW-UP JOB — envio pela conexão de WhatsApp da organização do lead + trava atômica.
 * O job reivindica os leads via claimDueFollowUps (trava no banco), resolve a
 * organização do lead (organization_id, ou a do dono quando nulo) e envia pela
 * conexão ativa dela. Sem conexão: não envia, libera a trava e loga
 * whatsapp_not_configured com organization_id (sem telefone).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { OrgWhatsApp } from '@/lib/integrations/whatsapp/org-whatsapp';
import { ConnectionNotConfiguredError } from '@/lib/connectors/types';

const {
  mockClaimDueFollowUps,
  mockReleaseFollowUpClaim,
  mockIncrementFollowUpCount,
  mockFindOrgForUser,
  mockSendText,
} = vi.hoisted(() => ({
  mockClaimDueFollowUps: vi.fn(),
  mockReleaseFollowUpClaim: vi.fn(),
  mockIncrementFollowUpCount: vi.fn(),
  mockFindOrgForUser: vi.fn(),
  mockSendText: vi.fn(),
}));

vi.mock('@/lib/repositories/lead.repository', () => ({
  leadRepository: {
    claimDueFollowUps: mockClaimDueFollowUps,
    releaseFollowUpClaim: mockReleaseFollowUpClaim,
    incrementFollowUpCount: mockIncrementFollowUpCount,
  },
}));
vi.mock('@/lib/repositories/connections.repository', () => ({
  connectionsRepository: { findOrganizationIdForUser: mockFindOrgForUser },
}));

import { runFollowUpJob } from '@/lib/jobs/follow-up.job';
import { setWhatsAppProviderFactoryForTests } from '@/lib/integrations/whatsapp/org-whatsapp';

const ORG_A = '0a0a0a0a-0000-0000-0000-00000000000a';
const ORG_SEM_WA = '0b0b0b0b-0000-0000-0000-00000000000b';
const USER_A = '00000000-0000-0000-0000-00000000000a';
const PHONE = '+5581999990001';

const factory = vi.fn(async (orgId: string): Promise<OrgWhatsApp> => {
  if (orgId === ORG_A) {
    return {
      provider: { sendText: mockSendText } as unknown as OrgWhatsApp['provider'],
      target: 'inst-org-a',
      connectionId: 'conn-a',
      organizationId: ORG_A,
    };
  }
  throw new ConnectionNotConfiguredError(orgId, 'whatsapp');
});

function lead(id: string, orgId: string | null, opts: { userId?: string | null; whatsapp?: string } = {}) {
  return {
    id,
    organization_id: orgId,
    user_id: opts.userId === undefined ? USER_A : opts.userId,
    whatsapp: opts.whatsapp ?? PHONE,
    follow_up_count: 0,
  };
}

let logSpies: Array<ReturnType<typeof vi.spyOn>> = [];
function allLogOutput(): string {
  return JSON.stringify(logSpies.flatMap((s) => s.mock.calls));
}

describe('runFollowUpJob — trava atômica e conexão por organização', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setWhatsAppProviderFactoryForTests(factory);
    mockReleaseFollowUpClaim.mockResolvedValue(undefined);
    mockIncrementFollowUpCount.mockResolvedValue(undefined);
    mockFindOrgForUser.mockResolvedValue(ORG_A);
    logSpies = [
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
      vi.spyOn(console, 'debug').mockImplementation(() => undefined),
    ];
  });
  afterEach(() => {
    setWhatsAppProviderFactoryForTests(null);
    for (const s of logSpies) s.mockRestore();
  });

  it('reivindica no máximo 20 leads por execução', async () => {
    mockClaimDueFollowUps.mockResolvedValue([]);
    await runFollowUpJob({ delayMs: 0 });
    expect(mockClaimDueFollowUps).toHaveBeenCalledWith(20);
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it('envia pela conexão da organização do lead e incrementa no sucesso', async () => {
    mockClaimDueFollowUps.mockResolvedValue([lead('lead-ok', ORG_A)]);
    mockSendText.mockResolvedValue({ success: true });

    await runFollowUpJob({ delayMs: 0 });

    expect(factory).toHaveBeenCalledWith(ORG_A);
    expect(mockSendText).toHaveBeenCalledWith('inst-org-a', PHONE, expect.any(String));
    expect(mockIncrementFollowUpCount).toHaveBeenCalledWith('lead-ok');
    expect(mockReleaseFollowUpClaim).not.toHaveBeenCalled();
  });

  it('lead com organization_id nulo → usa a organização do dono', async () => {
    mockClaimDueFollowUps.mockResolvedValue([lead('lead-sem-org', null)]);
    mockSendText.mockResolvedValue({ success: true });

    await runFollowUpJob({ delayMs: 0 });

    expect(mockFindOrgForUser).toHaveBeenCalledWith(USER_A);
    expect(factory).toHaveBeenCalledWith(ORG_A);
    expect(mockSendText).toHaveBeenCalledTimes(1);
  });

  it('org sem conexão de WhatsApp: não envia, libera a trava e loga whatsapp_not_configured sem telefone', async () => {
    mockClaimDueFollowUps.mockResolvedValue([lead('lead-sem-wa', ORG_SEM_WA)]);

    await runFollowUpJob({ delayMs: 0 });

    expect(mockSendText).not.toHaveBeenCalled();
    expect(mockReleaseFollowUpClaim).toHaveBeenCalledWith('lead-sem-wa');
    expect(mockIncrementFollowUpCount).not.toHaveBeenCalled();
    const out = allLogOutput();
    expect(out).toContain('whatsapp_not_configured');
    expect(out).toContain(ORG_SEM_WA);
    expect(out).not.toContain('99999');
  });

  it('nunca usa instância/credencial vinda de variável de ambiente', async () => {
    process.env.EVOLUTION_DEFAULT_INSTANCE = 'inst-env';
    process.env.EVOLUTION_API_URL = 'https://evo-global';
    mockClaimDueFollowUps.mockResolvedValue([lead('lead-sem-wa', ORG_SEM_WA)]);

    await runFollowUpJob({ delayMs: 0 });

    expect(mockSendText).not.toHaveBeenCalled();
    delete process.env.EVOLUTION_DEFAULT_INSTANCE;
    delete process.env.EVOLUTION_API_URL;
  });

  it('lead sem organização e sem dono: não envia e libera a trava', async () => {
    mockClaimDueFollowUps.mockResolvedValue([lead('lead-orfao', null, { userId: null })]);

    await runFollowUpJob({ delayMs: 0 });

    expect(factory).not.toHaveBeenCalled();
    expect(mockSendText).not.toHaveBeenCalled();
    expect(mockReleaseFollowUpClaim).toHaveBeenCalledWith('lead-orfao');
  });

  it('resolve a conexão uma vez por organização na mesma execução', async () => {
    mockClaimDueFollowUps.mockResolvedValue([
      lead('l1', ORG_A),
      lead('l2', ORG_A, { whatsapp: '+5581999990002' }),
    ]);
    mockSendText.mockResolvedValue({ success: true });

    await runFollowUpJob({ delayMs: 0 });

    expect(factory).toHaveBeenCalledTimes(1);
    expect(mockSendText).toHaveBeenCalledTimes(2);
  });

  it('envio falhou: libera a trava e não incrementa', async () => {
    mockClaimDueFollowUps.mockResolvedValue([lead('lead-falha', ORG_A)]);
    mockSendText.mockResolvedValue({ success: false, error: 'HTTP 500' });

    await runFollowUpJob({ delayMs: 0 });

    expect(mockReleaseFollowUpClaim).toHaveBeenCalledWith('lead-falha');
    expect(mockIncrementFollowUpCount).not.toHaveBeenCalledWith('lead-falha');
  });

  it('envio lançou exceção: libera a trava e segue para o próximo lead', async () => {
    mockClaimDueFollowUps.mockResolvedValue([
      lead('lead-falha', ORG_A),
      lead('lead-ok', ORG_A, { whatsapp: '+5581999990002' }),
    ]);
    mockSendText
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ success: true });

    await runFollowUpJob({ delayMs: 0 });

    expect(mockReleaseFollowUpClaim).toHaveBeenCalledWith('lead-falha');
    expect(mockIncrementFollowUpCount).not.toHaveBeenCalledWith('lead-falha');
    expect(mockIncrementFollowUpCount).toHaveBeenCalledWith('lead-ok');
  });

  it('envio ok mas incrementFollowUpCount lançou: NÃO devolve o lead (evita reenvio imediato)', async () => {
    mockClaimDueFollowUps.mockResolvedValue([lead('lead-ok-inc-falhou', ORG_A)]);
    mockSendText.mockResolvedValue({ success: true });
    mockIncrementFollowUpCount.mockRejectedValueOnce(new Error('db down'));

    await expect(runFollowUpJob({ delayMs: 0 })).resolves.toBeUndefined();

    expect(mockSendText).toHaveBeenCalledTimes(1);
    expect(mockReleaseFollowUpClaim).not.toHaveBeenCalled();
  });

  it('mistura de leads: cada um segue seu caminho', async () => {
    mockClaimDueFollowUps.mockResolvedValue([
      lead('lead-ok', ORG_A),
      lead('lead-sem-wa', ORG_SEM_WA),
      lead('lead-falha', ORG_A, { whatsapp: '+5581999990003' }),
    ]);
    mockSendText.mockImplementation(async (_t: string, to: string) =>
      to === '+5581999990003' ? { success: false, error: 'x' } : { success: true }
    );

    await runFollowUpJob({ delayMs: 0 });

    expect(mockSendText).toHaveBeenCalledTimes(2);
    for (const call of mockSendText.mock.calls) expect(call[0]).toBe('inst-org-a');
    expect(mockIncrementFollowUpCount).toHaveBeenCalledWith('lead-ok');
    expect(mockIncrementFollowUpCount).toHaveBeenCalledTimes(1);
    expect(mockReleaseFollowUpClaim).toHaveBeenCalledWith('lead-sem-wa');
    expect(mockReleaseFollowUpClaim).toHaveBeenCalledWith('lead-falha');
  });
});
