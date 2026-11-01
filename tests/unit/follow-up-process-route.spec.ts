/**
 * POST /api/internal/follow-up/process — chamada pelo consumidor da
 * Cloudflare Queue (handler.fetch) com Authorization: Bearer <CRON_SECRET>.
 * Processa cada mensagem e devolve o resultado por id; na última tentativa
 * com 'retry', devolve o lead (libera o claim) antes de responder.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  processFollowUpMessage: vi.fn(),
  releaseFollowUpClaim: vi.fn(),
}));

vi.mock('@/lib/jobs/follow-up.queue', () => ({
  processFollowUpMessage: mocks.processFollowUpMessage,
}));
vi.mock('@/lib/repositories/lead.repository', () => ({
  leadRepository: { releaseFollowUpClaim: mocks.releaseFollowUpClaim },
}));

import { POST } from '../../app/api/internal/follow-up/process/route';

const SECRET = 'test-cron-secret';
const LEAD_1 = '11111111-1111-4111-8111-111111111111';
const LEAD_2 = '22222222-2222-4222-8222-222222222222';

function post(body: unknown, auth: string | null = `Bearer ${SECRET}`) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth) headers.authorization = auth;
  return new NextRequest('http://x/api/internal/follow-up/process', {
    method: 'POST',
    body: JSON.stringify(body),
    headers,
  });
}

describe('POST /api/internal/follow-up/process', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
    mocks.releaseFollowUpClaim.mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
    vi.restoreAllMocks();
  });

  it('401 without bearer', async () => {
    const res = await POST(post({ messages: [] }, null));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe('UNAUTHORIZED');
    expect(mocks.processFollowUpMessage).not.toHaveBeenCalled();
  });

  it('400 on invalid body', async () => {
    const res = await POST(
      post({ messages: [{ id: 'm1', leadId: LEAD_1, followUpCount: 7, attempts: 1 }] })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(mocks.processFollowUpMessage).not.toHaveBeenCalled();
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

  it('200 returns outcomes per id', async () => {
    mocks.processFollowUpMessage.mockImplementation(async (msg: { leadId: string }) =>
      msg.leadId === LEAD_1 ? 'sent' : 'retry'
    );

    const res = await POST(
      post({
        messages: [
          { id: 'm1', leadId: LEAD_1, followUpCount: 0, attempts: 1 },
          { id: 'm2', leadId: LEAD_2, followUpCount: 2, attempts: 1 },
        ],
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: {
        results: [
          { id: 'm1', outcome: 'sent' },
          { id: 'm2', outcome: 'retry' },
        ],
      },
    });
    expect(mocks.processFollowUpMessage).toHaveBeenCalledWith({ leadId: LEAD_1, followUpCount: 0 });
    expect(mocks.processFollowUpMessage).toHaveBeenCalledWith({ leadId: LEAD_2, followUpCount: 2 });
    expect(mocks.releaseFollowUpClaim).not.toHaveBeenCalled();
  });

  it('releases claim on last retry attempt', async () => {
    mocks.processFollowUpMessage.mockResolvedValue('retry');

    const res = await POST(
      post({ messages: [{ id: 'm1', leadId: LEAD_1, followUpCount: 0, attempts: 3 }] })
    );

    expect(res.status).toBe(200);
    expect(mocks.releaseFollowUpClaim).toHaveBeenCalledWith(LEAD_1);
    expect(await res.json()).toEqual({ data: { results: [{ id: 'm1', outcome: 'retry' }] } });
  });
});
