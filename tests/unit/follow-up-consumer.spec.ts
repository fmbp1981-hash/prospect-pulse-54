/**
 * Consumidor da fila de follow-up (lógica pura, sem `.open-next`): monta o POST
 * para /api/internal/follow-up/process e traduz cada resultado em ack/retry.
 */
import { describe, it, expect, vi } from 'vitest';
import { handleFollowUpBatch, type QueueBatchLike } from '../../src/worker/follow-up-consumer';

type Msg = { id: string; body: { leadId: string; followUpCount: number }; attempts: number };

function makeMessage(id: string, attempts = 1) {
  return {
    id,
    attempts,
    body: { leadId: `lead-${id}`, followUpCount: 1 },
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

function makeBatch(messages: ReturnType<typeof makeMessage>[]) {
  return { messages, retryAll: vi.fn() } satisfies QueueBatchLike<Msg['body']>;
}

function jsonResponse(results: { id: string; outcome: string }[], status = 200) {
  return new Response(JSON.stringify({ data: { results } }), { status });
}

describe('handleFollowUpBatch', () => {
  it('acks sent and skipped', async () => {
    const [a, b] = [makeMessage('a'), makeMessage('b')];
    const batch = makeBatch([a, b]);
    const callRoute = vi.fn(async () =>
      jsonResponse([
        { id: 'a', outcome: 'sent' },
        { id: 'b', outcome: 'skipped' },
      ])
    );

    await handleFollowUpBatch(batch, callRoute, 'segredo');

    expect(a.ack).toHaveBeenCalledTimes(1);
    expect(b.ack).toHaveBeenCalledTimes(1);
    expect(a.retry).not.toHaveBeenCalled();
    expect(b.retry).not.toHaveBeenCalled();
    expect(batch.retryAll).not.toHaveBeenCalled();
  });

  it('retries with 30s delay on retry outcome', async () => {
    const [a, b] = [makeMessage('a'), makeMessage('b')];
    const batch = makeBatch([a, b]);
    const callRoute = vi.fn(async () =>
      jsonResponse([
        { id: 'a', outcome: 'retry' },
        { id: 'b', outcome: 'sent' },
      ])
    );

    await handleFollowUpBatch(batch, callRoute, 'segredo');

    expect(a.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
    expect(a.ack).not.toHaveBeenCalled();
    expect(b.ack).toHaveBeenCalledTimes(1);
  });

  it('retryAll on non-ok response', async () => {
    const batch = makeBatch([makeMessage('a')]);
    const callRoute = vi.fn(async () => new Response('boom', { status: 500 }));

    await handleFollowUpBatch(batch, callRoute, 'segredo');

    expect(batch.retryAll).toHaveBeenCalledWith({ delaySeconds: 30 });
  });

  it('retryAll on network error', async () => {
    const batch = makeBatch([makeMessage('a')]);
    const callRoute = vi.fn(async () => {
      throw new Error('network');
    });

    await handleFollowUpBatch(batch, callRoute, 'segredo');

    expect(batch.retryAll).toHaveBeenCalledWith({ delaySeconds: 30 });
  });

  it('retries a message missing from the response', async () => {
    const [a, b] = [makeMessage('a'), makeMessage('b')];
    const batch = makeBatch([a, b]);
    const callRoute = vi.fn(async () => jsonResponse([{ id: 'a', outcome: 'sent' }]));

    await handleFollowUpBatch(batch, callRoute, 'segredo');

    expect(a.ack).toHaveBeenCalledTimes(1);
    expect(b.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
  });

  it('sends bearer CRON_SECRET and the message payload', async () => {
    const batch = makeBatch([makeMessage('a', 2)]);
    let captured: Request | undefined;
    const callRoute = vi.fn(async (req: Request) => {
      captured = req;
      return jsonResponse([{ id: 'a', outcome: 'sent' }]);
    });

    await handleFollowUpBatch(batch, callRoute, 'segredo-xyz');

    expect(captured?.method).toBe('POST');
    expect(captured?.url).toBe('https://internal/api/internal/follow-up/process');
    expect(captured?.headers.get('Authorization')).toBe('Bearer segredo-xyz');
    expect(captured?.headers.get('Content-Type')).toBe('application/json');
    expect(await captured?.json()).toEqual({
      messages: [{ id: 'a', leadId: 'lead-a', followUpCount: 1, attempts: 2 }],
    });
  });
});
