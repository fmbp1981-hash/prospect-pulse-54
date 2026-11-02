/**
 * GET /api/cron/follow-up — modo explícito (FOLLOW_UP_MODE):
 * - no Cloudflare: `queue` + binding → despacha; `queue` sem binding → 503;
 *   `disabled` → 200 sem reivindicar nada; var ausente → tratada como `queue`
 * - fora do Cloudflare (Vercel/dev sem contexto) → job direto (runFollowUpJob)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

const mocks = vi.hoisted(() => ({
  runFollowUpJob: vi.fn(),
  dispatchDueFollowUps: vi.fn(),
  verifyCronRequest: vi.fn(),
}));

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
vi.mock('@/lib/jobs/follow-up.job', () => ({ runFollowUpJob: mocks.runFollowUpJob }));
vi.mock('@/lib/jobs/follow-up.queue', () => ({ dispatchDueFollowUps: mocks.dispatchDueFollowUps }));
vi.mock('@/lib/auth/cron-auth', () => ({ verifyCronRequest: mocks.verifyCronRequest }));

import { GET } from '../../app/api/cron/follow-up/route';

const req = () => new NextRequest('http://x/api/cron/follow-up', { headers: { authorization: 'Bearer s' } });

function onCloudflare(env: Record<string, unknown>) {
  vi.mocked(getCloudflareContext).mockResolvedValue({ env } as never);
}

describe('GET /api/cron/follow-up', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyCronRequest.mockReturnValue(true);
    mocks.runFollowUpJob.mockResolvedValue(undefined);
    mocks.dispatchDueFollowUps.mockResolvedValue(3);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('401 in { error: { code, message } } shape', async () => {
    mocks.verifyCronRequest.mockReturnValue(false);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
  });

  it('queue mode + binding → dispatches', async () => {
    const queue = { sendBatch: vi.fn() };
    onCloudflare({ FOLLOW_UP_MODE: 'queue', FOLLOW_UP_QUEUE: queue });

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(mocks.dispatchDueFollowUps).toHaveBeenCalledWith(queue);
    expect(mocks.runFollowUpJob).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.data).toEqual({ mode: 'queue', dispatched: 3 });
    expect(typeof json.meta.timestamp).toBe('string');
  });

  it('queue mode without binding → 503 QUEUE_NOT_CONFIGURED, never direct send', async () => {
    onCloudflare({ FOLLOW_UP_MODE: 'queue' });

    const res = await GET(req());

    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('QUEUE_NOT_CONFIGURED');
    expect(mocks.runFollowUpJob).not.toHaveBeenCalled();
    expect(mocks.dispatchDueFollowUps).not.toHaveBeenCalled();
  });

  it('missing FOLLOW_UP_MODE on Cloudflare behaves as queue (no binding → 503)', async () => {
    onCloudflare({});

    const res = await GET(req());

    expect(res.status).toBe(503);
    expect(mocks.runFollowUpJob).not.toHaveBeenCalled();
  });

  it('disabled mode → 200 without claiming anything', async () => {
    onCloudflare({ FOLLOW_UP_MODE: 'disabled', FOLLOW_UP_QUEUE: { sendBatch: vi.fn() } });

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ mode: 'disabled', dispatched: 0 });
    expect(mocks.dispatchDueFollowUps).not.toHaveBeenCalled();
    expect(mocks.runFollowUpJob).not.toHaveBeenCalled();
  });

  it('without Cloudflare context (Vercel/dev) → direct job', async () => {
    vi.mocked(getCloudflareContext).mockRejectedValue(new Error('no ctx'));

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ mode: 'direct' });
    expect(mocks.runFollowUpJob).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchDueFollowUps).not.toHaveBeenCalled();
  });

  it('500 without leaking the error', async () => {
    onCloudflare({ FOLLOW_UP_MODE: 'queue', FOLLOW_UP_QUEUE: { sendBatch: vi.fn() } });
    mocks.dispatchDueFollowUps.mockRejectedValue(new Error('db detail'));

    const res = await GET(req());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: { code: 'FOLLOW_UP_FAILED', message: 'Follow-up job failed' } });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('db detail');
  });
});
