/**
 * src/lib/runtime/bindings.ts — acesso ao contexto Cloudflare fora das rotas:
 * binding da fila de follow-up e modo explícito (FOLLOW_UP_MODE).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCloudflareContext } from '@opennextjs/cloudflare';

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));

import { getFollowUpMode, getFollowUpQueue } from '@/lib/runtime/bindings';

function onCloudflare(env: Record<string, unknown>) {
  vi.mocked(getCloudflareContext).mockResolvedValue({ env } as never);
}

describe('runtime bindings', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('getFollowUpMode', () => {
    it.each(['queue', 'disabled', 'direct'] as const)('honors FOLLOW_UP_MODE=%s on Cloudflare', async (mode) => {
      onCloudflare({ FOLLOW_UP_MODE: mode });
      await expect(getFollowUpMode()).resolves.toBe(mode);
    });

    it.each([[undefined], ['QUEUE'], ['banana'], ['']])('defaults to queue on Cloudflare for %s', async (value) => {
      onCloudflare(value === undefined ? {} : { FOLLOW_UP_MODE: value });
      await expect(getFollowUpMode()).resolves.toBe('queue');
    });

    it('direct when there is no Cloudflare context', async () => {
      vi.mocked(getCloudflareContext).mockRejectedValue(new Error('no ctx'));
      await expect(getFollowUpMode()).resolves.toBe('direct');
    });
  });

  describe('getFollowUpQueue', () => {
    it('returns the binding when present', async () => {
      const queue = { sendBatch: vi.fn() };
      onCloudflare({ FOLLOW_UP_QUEUE: queue });
      await expect(getFollowUpQueue()).resolves.toBe(queue);
    });

    it('null without binding', async () => {
      onCloudflare({});
      await expect(getFollowUpQueue()).resolves.toBeNull();
    });

    it('null without Cloudflare context', async () => {
      vi.mocked(getCloudflareContext).mockRejectedValue(new Error('no ctx'));
      await expect(getFollowUpQueue()).resolves.toBeNull();
    });
  });
});
