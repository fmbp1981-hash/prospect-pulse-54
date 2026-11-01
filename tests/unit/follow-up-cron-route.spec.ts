/**
 * GET /api/cron/follow-up — com o binding FOLLOW_UP_QUEUE só despacha para a
 * fila; sem contexto Cloudflare ou sem o binding, roda o job direto.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

const mocks = vi.hoisted(() => ({
  runFollowUpJob: vi.fn(),
  dispatchDueFollowUps: vi.fn(),
}));

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
vi.mock('@/lib/jobs/follow-up.job', () => ({ runFollowUpJob: mocks.runFollowUpJob }));
vi.mock('@/lib/jobs/follow-up.queue', () => ({ dispatchDueFollowUps: mocks.dispatchDueFollowUps }));
vi.mock('@/lib/auth/cron-auth', () => ({ verifyCronRequest: () => true }));

import { GET } from '../../app/api/cron/follow-up/route';

const req = () => new NextRequest('http://x/api/cron/follow-up', { headers: { authorization: 'Bearer s' } });

describe('GET /api/cron/follow-up', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runFollowUpJob.mockResolvedValue(undefined);
    mocks.dispatchDueFollowUps.mockResolvedValue(3);
  });
  afterEach(() => vi.restoreAllMocks());

  it('despacha pela fila quando há FOLLOW_UP_QUEUE', async () => {
    const queue = { sendBatch: vi.fn() };
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: { FOLLOW_UP_QUEUE: queue } } as never);

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(mocks.dispatchDueFollowUps).toHaveBeenCalledWith(queue);
    expect(mocks.runFollowUpJob).not.toHaveBeenCalled();
    expect((await res.json()).dispatched).toBe(3);
  });

  it('roda o job direto quando o binding não existe', async () => {
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: {} } as never);

    await GET(req());

    expect(mocks.runFollowUpJob).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchDueFollowUps).not.toHaveBeenCalled();
  });

  it('roda o job direto sem contexto Cloudflare', async () => {
    vi.mocked(getCloudflareContext).mockRejectedValue(new Error('no ctx'));

    await GET(req());

    expect(mocks.runFollowUpJob).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchDueFollowUps).not.toHaveBeenCalled();
  });
});
