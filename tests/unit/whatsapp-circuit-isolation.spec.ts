/**
 * T5-ISO-01 — circuit breaker por conexão.
 *
 * Antes: evolutionCircuit/metaCircuit eram singletons do processo; 3 envios
 * Meta com número inválido de uma organização abriam o circuito e derrubavam
 * o envio Meta de TODAS as organizações (Evolution: 5 falhas, 60 s).
 * Agora: um circuito por conexão, e respostas 4xx de validação (número
 * inválido etc.) não contam como falha do circuito — só 5xx/timeout/rede.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/connectors/usage', () => ({ recordUsage: vi.fn(async () => undefined) }));

import { EvolutionProvider } from '@/lib/integrations/whatsapp/providers/evolution.provider';
import { MetaCloudProvider } from '@/lib/integrations/whatsapp/providers/meta-cloud.provider';
import { resetProviderCircuitsForTests } from '@/lib/utils/resilience';

const ORG_A = '0a0a0a0a-0000-0000-0000-00000000000a';
const ORG_B = '0b0b0b0b-0000-0000-0000-00000000000b';

function meta(connectionId: string, organizationId: string, phoneNumberId: string) {
  return new MetaCloudProvider({
    accessToken: 't',
    phoneNumberId,
    apiVersion: 'v20.0',
    appSecret: 's',
    verifyToken: 'v',
    usage: { organizationId, connectionId },
  });
}
function evolution(connectionId: string, organizationId: string, baseUrl: string) {
  return new EvolutionProvider({ baseUrl, apiKey: 'k', usage: { organizationId, connectionId } });
}

const ok = () => new Response(JSON.stringify({ key: { id: 'ok' }, messages: [{ id: 'ok' }] }), { status: 200 });

beforeEach(() => {
  vi.useFakeTimers();
  resetProviderCircuitsForTests();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function run<T>(p: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return p;
}

describe('Meta — circuito por conexão', () => {
  it('falhas 5xx abrem o circuito só da conexão A; B continua chamando o fetch', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('/phone-a/') ? new Response('erro', { status: 500 }) : ok()
    );
    vi.stubGlobal('fetch', fetchMock);
    const a = meta('conn-a', ORG_A, 'phone-a');
    const b = meta('conn-b', ORG_B, 'phone-b');

    for (let i = 0; i < 3; i++) expect((await run(a.sendText('x', '5581999990001', 'oi'))).success).toBe(false);
    const callsAfterA = fetchMock.mock.calls.length;

    // A está aberto: não chama o fetch
    const blocked = await run(a.sendText('x', '5581999990001', 'oi'));
    expect(blocked.success).toBe(false);
    expect(fetchMock.mock.calls.length).toBe(callsAfterA);

    // B não é afetado
    const resB = await run(b.sendText('x', '5581999990002', 'oi'));
    expect(resB.success).toBe(true);
    expect(fetchMock.mock.calls.length).toBe(callsAfterA + 1);
  });

  it('400 (número inválido) três vezes em A → B envia normalmente', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('/phone-a/') ? new Response('{"error":{"message":"invalid"}}', { status: 400 }) : ok()
    );
    vi.stubGlobal('fetch', fetchMock);
    const a = meta('conn-a', ORG_A, 'phone-a');
    const b = meta('conn-b', ORG_B, 'phone-b');

    for (let i = 0; i < 3; i++) expect((await run(a.sendText('x', '000', 'oi'))).success).toBe(false);
    const before = fetchMock.mock.calls.length;
    expect((await run(b.sendText('x', '5581999990002', 'oi'))).success).toBe(true);
    expect(fetchMock.mock.calls.length).toBe(before + 1);
  });

  it('4xx repetidos não abrem o circuito de A (cada envio ainda chama o fetch, sem retry)', async () => {
    const fetchMock = vi.fn(async () => new Response('{"error":{"message":"invalid"}}', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    const a = meta('conn-a', ORG_A, 'phone-a');

    for (let i = 0; i < 10; i++) await run(a.sendText('x', '000', 'oi'));
    expect(fetchMock).toHaveBeenCalledTimes(10);

    fetchMock.mockImplementation(async () => ok());
    expect((await run(a.sendText('x', '5581999990001', 'oi'))).success).toBe(true);
  });
});

describe('Evolution — circuito por conexão', () => {
  it('5 falhas 5xx na conexão A não bloqueiam a conexão B', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.startsWith('https://evo-a') ? new Response('erro', { status: 502 }) : ok()
    );
    vi.stubGlobal('fetch', fetchMock);
    const a = evolution('conn-a', ORG_A, 'https://evo-a.test');
    const b = evolution('conn-b', ORG_B, 'https://evo-b.test');

    for (let i = 0; i < 5; i++) await run(a.sendText('inst-a', '5581999990001', 'oi'));
    const callsAfterA = fetchMock.mock.calls.length;
    await run(a.sendText('inst-a', '5581999990001', 'oi'));
    expect(fetchMock.mock.calls.length).toBe(callsAfterA); // A aberto

    expect((await run(b.sendText('inst-b', '5581999990002', 'oi'))).success).toBe(true);
  });

  it('4xx repetidos não abrem o circuito', async () => {
    const fetchMock = vi.fn(async () => new Response('bad number', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    const a = evolution('conn-a', ORG_A, 'https://evo-a.test');

    for (let i = 0; i < 8; i++) await run(a.sendText('inst-a', '000', 'oi'));
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });
});
