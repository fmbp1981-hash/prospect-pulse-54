import { describe, it, expect, vi } from 'vitest';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { runAfterResponse } from '@/lib/runtime/after-response';

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));

describe('runAfterResponse', () => {
  it('registers the task in ctx.waitUntil', () => {
    const waitUntil = vi.fn();
    vi.mocked(getCloudflareContext).mockReturnValue({ ctx: { waitUntil } } as never);
    const task = Promise.resolve();
    runAfterResponse(task);
    expect(waitUntil).toHaveBeenCalledWith(task);
  });

  it('does not throw without Cloudflare context and logs rejection', async () => {
    vi.mocked(getCloudflareContext).mockImplementation(() => {
      throw new Error('no ctx');
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => runAfterResponse(Promise.reject(new Error('boom')))).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).toHaveBeenCalledWith('[after-response]', expect.any(Error));
    spy.mockRestore();
  });
});
