/**
 * Provedores de WhatsApp — robustez do envio (Sprint 2b, Task 5).
 *
 * - timeout de 10 s no fetch de envio vira envio falho, nunca exceção
 *   (movido de messaging.client.ts, que foi removido);
 * - falha no registro de consumo nunca transforma um envio bem-sucedido em falha;
 * - serialização/log do provedor nunca expõe credenciais.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { inspect } from 'node:util';

const mocks = vi.hoisted(() => ({
  recordUsage: vi.fn<(...a: unknown[]) => Promise<void>>(async () => undefined),
}));
vi.mock('@/lib/connectors/usage', () => ({ recordUsage: mocks.recordUsage }));

import { EvolutionProvider } from '@/lib/integrations/whatsapp/providers/evolution.provider';
import { MetaCloudProvider } from '@/lib/integrations/whatsapp/providers/meta-cloud.provider';

const USAGE = { organizationId: '11111111-1111-1111-1111-111111111111', connectionId: 'conn-1' };

function evolution() {
  return new EvolutionProvider({ baseUrl: 'https://evo.example.com', apiKey: 'EVO-SECRET-KEY', usage: USAGE });
}
function meta() {
  return new MetaCloudProvider({
    accessToken: 'META-ACCESS-TOKEN',
    phoneNumberId: '555000111',
    apiVersion: 'v20.0',
    appSecret: 'META-APP-SECRET',
    verifyToken: 'META-VERIFY-TOKEN',
    usage: USAGE,
  });
}

beforeEach(() => {
  mocks.recordUsage.mockReset();
  mocks.recordUsage.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe.each([
  ['evolution', evolution, { key: { id: 'msg-1' } }],
  ['meta', meta, { messages: [{ id: 'msg-1' }] }],
] as const)('%s — timeout do envio', (_name, make, okBody) => {
  it('passa um AbortSignal para o fetch de envio', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(okBody), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await make().sendText('alvo', '+55 81 99999-0001', 'oi');

    expect(result).toEqual({ success: true, messageId: 'msg-1' });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('timeout retorna { success: false } em vez de lançar', async () => {
    vi.useFakeTimers();
    const timeoutError = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    vi.stubGlobal('fetch', vi.fn(async () => { throw timeoutError; }));

    const pending = make().sendText('alvo', '5581999990001', 'oi');
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.success).toBe(false);
    expect(result.error).toBe('Timeout após 10000 ms');
    expect(mocks.recordUsage).not.toHaveBeenCalled();
  });
});

describe.each([
  ['evolution', evolution, { key: { id: 'msg-1' } }],
  ['meta', meta, { messages: [{ id: 'msg-1' }] }],
] as const)('%s — registro de consumo nunca derruba o envio', (_name, make, okBody) => {
  it('recordUsage rejeitando → sendText continua { success: true }', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(okBody), { status: 200 })));
    mocks.recordUsage.mockRejectedValue(new Error('db down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await make().sendText('alvo', '5581999990001', 'oi');
    await new Promise((r) => setTimeout(r, 0));

    expect(result).toEqual({ success: true, messageId: 'msg-1' });
    expect(mocks.recordUsage).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });

  it('recordUsage rejeitando → sendMedia continua { success: true }', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(okBody), { status: 200 })));
    mocks.recordUsage.mockRejectedValue(new Error('db down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await make().sendMedia('alvo', '5581999990001', { type: 'image', url: 'https://x.test/a.jpg' });
    await new Promise((r) => setTimeout(r, 0));

    expect(result).toEqual({ success: true, messageId: 'msg-1' });
    errSpy.mockRestore();
  });

  it('recordUsage lento não atrasa o retorno do envio', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(okBody), { status: 200 })));
    mocks.recordUsage.mockImplementation(() => new Promise<void>(() => undefined)); // nunca resolve

    const result = await make().sendText('alvo', '5581999990001', 'oi');

    expect(result.success).toBe(true);
  });
});

describe('serialização sem credenciais', () => {
  const SECRETS = ['EVO-SECRET-KEY', 'META-ACCESS-TOKEN', 'META-APP-SECRET', 'META-VERIFY-TOKEN'];

  it.each([
    ['evolution', evolution, 'evolution'],
    ['meta', meta, 'meta-cloud'],
  ] as const)('%s: JSON.stringify devolve só { name }', (_n, make, name) => {
    const p = make();
    expect(JSON.parse(JSON.stringify(p))).toEqual({ name });
    for (const s of SECRETS) expect(JSON.stringify({ provider: p })).not.toContain(s);
  });

  it.each([
    ['evolution', evolution],
    ['meta', meta],
  ] as const)('%s: inspect/console não mostra credenciais', (_n, make) => {
    const text = inspect(make(), { depth: 5 });
    for (const s of SECRETS) expect(text).not.toContain(s);
  });

  it('MetaCloudProvider não expõe appSecret/verifyToken como campos públicos', () => {
    const p = meta() as unknown as Record<string, unknown>;
    expect(Object.keys(p)).not.toContain('appSecret');
    expect(Object.keys(p)).not.toContain('verifyToken');
  });
});
