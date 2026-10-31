/**
 * sendWhatsAppText — timeout de 10 s no fetch vira envio falho, nunca exceção.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendWhatsAppText } from '@/lib/integrations/evolution/messaging.client';

describe('sendWhatsAppText — timeout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passa um AbortSignal para o fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'msg-1' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendWhatsAppText({ instanceName: 'inst', to: '+55 81 99999-0001', text: 'oi' });

    expect(result).toEqual({ success: true, messageId: 'msg-1' });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('timeout retorna { success: false } em vez de lançar', async () => {
    const timeoutError = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError));

    const result = await sendWhatsAppText({ instanceName: 'inst', to: '5581999990001', text: 'oi' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Timeout após 10000 ms');
  });
});
