/**
 * POST /api/internal/follow-up/process — chamada pelo consumidor da
 * Cloudflare Queue (handler.fetch) com Authorization: Bearer
 * <INTERNAL_QUEUE_SECRET> e host `internal`. A rota só autentica, valida,
 * chama processFollowUpBatch e responde; a política de última entrega e o
 * espaçamento entre envios ficam em follow-up.queue.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  processFollowUpBatch: vi.fn(),
}));

vi.mock('@/lib/jobs/follow-up.queue', () => ({
  processFollowUpBatch: mocks.processFollowUpBatch,
}));

import { POST } from '../../app/api/internal/follow-up/process/route';

const SECRET = 'test-internal-queue-secret';
const CRON = 'test-cron-secret';
const LEAD_1 = '11111111-1111-4111-8111-111111111111';
const LEAD_2 = '22222222-2222-4222-8222-222222222222';

function post(
  body: unknown,
  auth: string | null = `Bearer ${SECRET}`,
  url = 'https://internal/api/internal/follow-up/process'
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth) headers.authorization = auth;
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers,
  });
}

describe('POST /api/internal/follow-up/process', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_QUEUE_SECRET = SECRET;
    process.env.CRON_SECRET = CRON;
    mocks.processFollowUpBatch.mockResolvedValue([]);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    delete process.env.INTERNAL_QUEUE_SECRET;
    delete process.env.CRON_SECRET;
    vi.restoreAllMocks();
  });

  it('401 without bearer', async () => {
    const res = await POST(post({ messages: [] }, null));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe('UNAUTHORIZED');
    expect(mocks.processFollowUpBatch).not.toHaveBeenCalled();
  });

  it('401 with CRON_SECRET (dedicated secret only)', async () => {
    const res = await POST(post({ messages: [] }, `Bearer ${CRON}`));
    expect(res.status).toBe(401);
    expect(mocks.processFollowUpBatch).not.toHaveBeenCalled();
  });

  it('401 when INTERNAL_QUEUE_SECRET is not configured', async () => {
    delete process.env.INTERNAL_QUEUE_SECRET;
    const res = await POST(post({ messages: [] }, 'Bearer undefined'));
    expect(res.status).toBe(401);
  });

  it('403 with the right secret but an external host', async () => {
    const res = await POST(
      post({ messages: [] }, `Bearer ${SECRET}`, 'https://prospect-pulse-54.example.workers.dev/api/internal/follow-up/process')
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('FORBIDDEN');
    expect(mocks.processFollowUpBatch).not.toHaveBeenCalled();
  });

  it('400 on invalid body', async () => {
    const res = await POST(
      post({ messages: [{ id: 'm1', leadId: LEAD_1, followUpCount: 7, attempts: 1 }] })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(mocks.processFollowUpBatch).not.toHaveBeenCalled();
  });

  it('400 on more than 10 messages', async () => {
    const messages = Array.from({ length: 11 }, (_, i) => ({
      id: `m${i}`,
      leadId: LEAD_1,
      followUpCount: 0,
      attempts: 1,
    }));
    const res = await POST(post({ messages }));
    expect(res.status).toBe(400);
  });

  it('200 with right secret + internal host: returns outcomes per id', async () => {
    const results = [
      { id: 'm1', outcome: 'sent' },
      { id: 'm2', outcome: 'retry' },
    ];
    mocks.processFollowUpBatch.mockResolvedValue(results);
    const messages = [
      { id: 'm1', leadId: LEAD_1, followUpCount: 0, attempts: 1 },
      { id: 'm2', leadId: LEAD_2, followUpCount: 2, attempts: 4 },
    ];

    const res = await POST(post({ messages }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { results }, meta: { processed: 2 } });
    expect(mocks.processFollowUpBatch).toHaveBeenCalledWith(messages);
  });

  it('500 without leaking the error message when processing throws', async () => {
    mocks.processFollowUpBatch.mockRejectedValue(new Error('boom with detail'));

    const res = await POST(post({ messages: [{ id: 'm1', leadId: LEAD_1, followUpCount: 0, attempts: 1 }] }));

    expect(res.status).toBe(500);
    const body = JSON.stringify(await res.json());
    expect(body).toContain('INTERNAL_ERROR');
    expect(body).not.toContain('boom with detail');
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('boom with detail');
  });
});
