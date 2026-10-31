/**
 * leadRepository — reivindicação/devolução de follow-up.
 * releaseFollowUpClaim devolve o lead com backoff (não zera a trava), para
 * que leads com problema permanente não monopolizem o lote do job.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockUpdate, mockEq, mockRpc } = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
  mockEq: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({ update: mockUpdate })),
    rpc: mockRpc,
  })),
}));

import { leadRepository } from '@/lib/repositories/lead.repository';

const NOW = new Date('2026-10-30T12:00:00.000Z');

describe('leadRepository — follow-up claim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    mockEq.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('releaseFollowUpClaim aplica backoff padrão de 15 min (não zera a trava)', async () => {
    await leadRepository.releaseFollowUpClaim('lead-1');

    expect(mockUpdate).toHaveBeenCalledWith({
      follow_up_lock_until: '2026-10-30T12:15:00.000Z',
    });
    expect(mockEq).toHaveBeenCalledWith('id', 'lead-1');
  });

  it('releaseFollowUpClaim aceita backoff customizado', async () => {
    await leadRepository.releaseFollowUpClaim('lead-2', 60);

    expect(mockUpdate).toHaveBeenCalledWith({
      follow_up_lock_until: '2026-10-30T13:00:00.000Z',
    });
  });

  it('releaseFollowUpClaim propaga erro do banco', async () => {
    mockEq.mockResolvedValue({ error: { message: 'boom' } });

    await expect(leadRepository.releaseFollowUpClaim('lead-3')).rejects.toThrow(
      'releaseFollowUpClaim error: boom'
    );
  });

  it('claimDueFollowUps chama a RPC com o limite', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'a' }], error: null });

    const rows = await leadRepository.claimDueFollowUps(20);

    expect(mockRpc).toHaveBeenCalledWith('claim_due_follow_ups', { p_limit: 20 });
    expect(rows).toEqual([{ id: 'a' }]);
  });
});
