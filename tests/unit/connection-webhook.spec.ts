/**
 * Webhook de WhatsApp por conexão (Sprint 2b, Task 6):
 *   GET/POST /api/webhooks/whatsapp/<webhook_key>
 *
 * A chave opaca da URL identifica a conexão; a organização vem SEMPRE da
 * conexão. Meta: assinatura X-Hub-Signature-256 com o appSecret da conexão.
 * Evolution: apikey da conexão + instância do payload = instância da conexão.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';

const pending: Promise<unknown>[] = [];
vi.mock('@/lib/runtime/after-response', () => ({
  runAfterResponse: (p: Promise<unknown>) => {
    pending.push(p);
  },
}));

const mocks = vi.hoisted(() => ({
  resolveConnectionByWebhookKey: vi.fn(),
  resolveConnection: vi.fn(),
  processInboundWhatsAppEvent: vi.fn(async () => undefined),
}));
vi.mock('@/lib/connectors/resolve-connection', () => ({
  resolveConnectionByWebhookKey: mocks.resolveConnectionByWebhookKey,
  resolveConnection: mocks.resolveConnection,
}));
vi.mock('@/lib/webhooks/whatsapp-inbound.handler', () => ({
  processInboundWhatsAppEvent: mocks.processInboundWhatsAppEvent,
}));

import { GET, POST } from '../../app/api/webhooks/whatsapp/[key]/route';

const KEY = 'b'.repeat(32) + '0123456789abcdef0123456789abcdef';
const ORG_A = '0a0a0a0a-0000-0000-0000-00000000000a';
const ORG_B = '0b0b0b0b-0000-0000-0000-00000000000b';

const META_CONN = {
  id: 'conn-meta',
  organizationId: ORG_A,
  category: 'whatsapp',
  provider: 'meta_cloud',
  credentialSource: 'own',
  config: { phoneNumberId: '106540352242922', apiVersion: 'v20.0' },
  secret: { accessToken: 'tok', appSecret: 'app-s3cr3t', verifyToken: 'verif-123' },
};
const EVO_CONN = {
  id: 'conn-evo',
  organizationId: ORG_A,
  category: 'whatsapp',
  provider: 'evolution',
  credentialSource: 'own',
  config: { baseUrl: 'https://evo.example.com', instanceName: 'inst-a' },
  secret: { apiKey: 'evo-key-a' },
};

function metaBody(phoneNumberId = '106540352242922', extraValue: Record<string, unknown> = {}) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550783881', phone_number_id: phoneNumberId },
              contacts: [{ profile: { name: 'Fulano' }, wa_id: '5511999990000' }],
              messages: [
                { from: '5511999990000', id: 'wamid.1', timestamp: '1730000000', type: 'text', text: { body: 'oi' } },
              ],
              ...extraValue,
            },
          },
        ],
      },
    ],
  });
}

function evoBody(instance = 'inst-a', extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    event: 'messages.upsert',
    instance,
    data: {
      key: { remoteJid: '5511999990000@s.whatsapp.net', fromMe: false, id: 'msg-1' },
      pushName: 'Fulano',
      message: { conversation: 'oi' },
      messageTimestamp: 1730000000,
    },
    ...extra,
  });
}

const sign = (body: string, secret: string) => 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

function post(body: string, headers: Record<string, string> = {}, key = KEY) {
  return POST(
    new NextRequest(`http://x/api/webhooks/whatsapp/${key}`, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json', ...headers },
    }),
    { params: { key } }
  );
}

function get(query: string, key = KEY) {
  return GET(new NextRequest(`http://x/api/webhooks/whatsapp/${key}?${query}`), { params: { key } });
}

let logSpies: Array<ReturnType<typeof vi.spyOn>> = [];
beforeEach(() => {
  pending.length = 0;
  vi.clearAllMocks();
  logSpies = [
    vi.spyOn(console, 'log').mockImplementation(() => undefined),
    vi.spyOn(console, 'warn').mockImplementation(() => undefined),
    vi.spyOn(console, 'error').mockImplementation(() => undefined),
  ];
});
afterEach(() => {
  for (const s of logSpies) s.mockRestore();
});
const logged = () => JSON.stringify(logSpies.flatMap((s) => s.mock.calls));

describe('chave da URL', () => {
  it('key malformada → 401 sem tocar no banco (POST e GET)', async () => {
    expect((await post(evoBody(), {}, 'abc')).status).toBe(401);
    expect((await get('hub.mode=subscribe&hub.verify_token=x&hub.challenge=1', 'ABC')).status).toBe(401);
    expect(mocks.resolveConnectionByWebhookKey).not.toHaveBeenCalled();
  });

  it('key desconhecida → 401 e nada processado', async () => {
    mocks.resolveConnectionByWebhookKey.mockResolvedValueOnce(null);
    const res = await post(evoBody(), { apikey: 'evo-key-a' });
    expect(res.status).toBe(401);
    expect(pending).toHaveLength(0);
  });

  it('resolvedor lança (credencial/segredo inválido) → 401, log mascarado sem a chave', async () => {
    mocks.resolveConnectionByWebhookKey.mockRejectedValueOnce(new Error(`falhou ${KEY}`));
    const res = await post(evoBody(), { apikey: 'evo-key-a' });
    expect(res.status).toBe(401);
    expect(pending).toHaveLength(0);
    expect(logged()).toContain('webhook_connection_unresolvable');
    expect(logged()).not.toContain(KEY);
  });
});

describe('GET verificação Meta', () => {
  it('verify_token certo devolve o challenge', async () => {
    mocks.resolveConnectionByWebhookKey.mockResolvedValueOnce(META_CONN);
    const res = await get('hub.mode=subscribe&hub.verify_token=verif-123&hub.challenge=987');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('987');
  });

  it('verify_token errado → 403', async () => {
    mocks.resolveConnectionByWebhookKey.mockResolvedValueOnce(META_CONN);
    const res = await get('hub.mode=subscribe&hub.verify_token=outro&hub.challenge=987');
    expect(res.status).toBe(403);
  });

  it('conexão Evolution não responde challenge → 403', async () => {
    mocks.resolveConnectionByWebhookKey.mockResolvedValueOnce(EVO_CONN);
    const res = await get('hub.mode=subscribe&hub.verify_token=evo-key-a&hub.challenge=987');
    expect(res.status).toBe(403);
  });
});

describe('POST Meta', () => {
  it('assinatura inválida → 401, handler não chamado', async () => {
    mocks.resolveConnectionByWebhookKey.mockResolvedValueOnce(META_CONN);
    const body = metaBody();
    const res = await post(body, { 'x-hub-signature-256': sign(body, 'outro-secret') });
    expect(res.status).toBe(401);
    expect(pending).toHaveLength(0);
    expect(mocks.processInboundWhatsAppEvent).not.toHaveBeenCalled();
  });

  it('assinatura conferida antes do parse: corpo inválido sem assinatura → 401 (não 400)', async () => {
    mocks.resolveConnectionByWebhookKey.mockResolvedValueOnce(META_CONN);
    const res = await post('{nao-e-json');
    expect(res.status).toBe(401);
  });

  it('sem assinatura → 401', async () => {
    mocks.resolveConnectionByWebhookKey.mockResolvedValueOnce(META_CONN);
    const res = await post(metaBody());
    expect(res.status).toBe(401);
    expect(mocks.processInboundWhatsAppEvent).not.toHaveBeenCalled();
  });

  it('assinatura válida → 200 e evento com organização e conexão da conexão', async () => {
    mocks.resolveConnectionByWebhookKey.mockResolvedValueOnce(META_CONN);
    const body = metaBody();
    const res = await post(body, { 'x-hub-signature-256': sign(body, 'app-s3cr3t') });
    expect(res.status).toBe(200);
    await Promise.all(pending);
    expect(mocks.processInboundWhatsAppEvent).toHaveBeenCalledTimes(1);
    expect(mocks.processInboundWhatsAppEvent).toHaveBeenCalledWith({
      organizationId: ORG_A,
      connectionId: 'conn-meta',
      event: expect.objectContaining({
        organizationId: ORG_A,
        connectionId: 'conn-meta',
        provider: 'meta_cloud',
        from: '5511999990000',
        messageId: 'wamid.1',
        type: 'text',
        text: 'oi',
      }),
    });
  });

  it('status updates (sem messages) → 200 sem processar', async () => {
    mocks.resolveConnectionByWebhookKey.mockResolvedValueOnce(META_CONN);
    const body = metaBody('106540352242922', {
      messages: undefined,
      statuses: [{ id: 'wamid.1', status: 'read', timestamp: '1730000001', recipient_id: '5511999990000' }],
    });
    const res = await post(body, { 'x-hub-signature-256': sign(body, 'app-s3cr3t') });
    expect(res.status).toBe(200);
    expect(pending).toHaveLength(0);
    expect(mocks.processInboundWhatsAppEvent).not.toHaveBeenCalled();
  });

  it('mensagem para outro phone_number_id → 200 sem processar (não é desta conexão)', async () => {
    mocks.resolveConnectionByWebhookKey.mockResolvedValueOnce(META_CONN);
    const body = metaBody('999999999');
    const res = await post(body, { 'x-hub-signature-256': sign(body, 'app-s3cr3t') });
    expect(res.status).toBe(200);
    expect(mocks.processInboundWhatsAppEvent).not.toHaveBeenCalled();
    expect(logged()).toContain('meta_phone_number_mismatch');
  });

  it('corpo > 1 MB → 413 sem processar', async () => {
    mocks.resolveConnectionByWebhookKey.mockResolvedValueOnce(META_CONN);
    const res = await post(metaBody(), { 'content-length': String(1024 * 1024 + 1) });
    expect(res.status).toBe(413);
    expect(pending).toHaveLength(0);
  });
});

describe('POST Evolution', () => {
  it('apikey errada → 401, handler não chamado', async () => {
    mocks.resolveConnectionByWebhookKey.mockResolvedValueOnce(EVO_CONN);
    const res = await post(evoBody(), { apikey: 'chave-errada' });
    expect(res.status).toBe(401);
    expect(pending).toHaveLength(0);
    expect(mocks.processInboundWhatsAppEvent).not.toHaveBeenCalled();
  });

  it('sem apikey (header nem corpo) → 401', async () => {
    mocks.resolveConnectionByWebhookKey.mockResolvedValueOnce(EVO_CONN);
    const res = await post(evoBody());
    expect(res.status).toBe(401);
    expect(mocks.processInboundWhatsAppEvent).not.toHaveBeenCalled();
  });

  it('apikey no corpo (formato Evolution v2) também autentica', async () => {
    mocks.resolveConnectionByWebhookKey.mockResolvedValueOnce(EVO_CONN);
    const res = await post(evoBody('inst-a', { apikey: 'evo-key-a' }));
    expect(res.status).toBe(200);
    await Promise.all(pending);
    expect(mocks.processInboundWhatsAppEvent).toHaveBeenCalledTimes(1);
  });

  it('payload de outra instância → 401', async () => {
    mocks.resolveConnectionByWebhookKey.mockResolvedValueOnce(EVO_CONN);
    const res = await post(evoBody('inst-b'), { apikey: 'evo-key-a' });
    expect(res.status).toBe(401);
    expect(mocks.processInboundWhatsAppEvent).not.toHaveBeenCalled();
  });

  it('organização do evento = da conexão mesmo com payload dizendo outra coisa', async () => {
    mocks.resolveConnectionByWebhookKey.mockResolvedValueOnce(EVO_CONN);
    const body = JSON.parse(evoBody('inst-a', { organizationId: ORG_B, organization_id: ORG_B }));
    body.data.organizationId = ORG_B;
    const res = await post(JSON.stringify(body), { apikey: 'evo-key-a' });
    expect(res.status).toBe(200);
    await Promise.all(pending);
    const [input] = mocks.processInboundWhatsAppEvent.mock.calls[0] as unknown as [
      { organizationId: string; connectionId: string; event: { organizationId: string } },
    ];
    expect(input.organizationId).toBe(ORG_A);
    expect(input.event.organizationId).toBe(ORG_A);
    expect(input.connectionId).toBe('conn-evo');
    expect(JSON.stringify(input)).not.toContain(ORG_B);
  });

  it('grupo → 200 sem processar', async () => {
    mocks.resolveConnectionByWebhookKey.mockResolvedValueOnce(EVO_CONN);
    const body = JSON.stringify({
      event: 'messages.upsert',
      instance: 'inst-a',
      data: { key: { remoteJid: '120363@g.us', id: 'g1' }, message: { conversation: 'x' } },
    });
    const res = await post(body, { apikey: 'evo-key-a' });
    expect(res.status).toBe(200);
    expect(mocks.processInboundWhatsAppEvent).not.toHaveBeenCalled();
  });

  it('erro no processamento não vaza telefone nem texto no log', async () => {
    mocks.resolveConnectionByWebhookKey.mockResolvedValueOnce(EVO_CONN);
    mocks.processInboundWhatsAppEvent.mockRejectedValueOnce(new Error('boom 5511999990000 oi'));
    const res = await post(evoBody(), { apikey: 'evo-key-a' });
    expect(res.status).toBe(200);
    await Promise.allSettled(pending);
    expect(logged()).toContain('inbound_processing_failed');
    expect(logged()).not.toContain('5511999990000');
    expect(logged()).not.toContain('evo-key-a');
  });
});
