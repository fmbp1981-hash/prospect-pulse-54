/**
 * Webhook legado /api/webhooks/evolution/<token> (F-02 + Sprint 2b, Task 6)
 * e processamento comum das mensagens de entrada.
 *
 * O token só identifica o usuário; a organização dele define a conexão de
 * WhatsApp ativa, que autentica o corpo. Nada vem de variáveis de ambiente
 * (WHATSAPP_PROVIDER / META_* são ignoradas) nem do payload (instance).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';

const pending: Promise<unknown>[] = [];
vi.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => {
    pending.push(p);
  },
}));

const mocks = vi.hoisted(() => ({
  resolveTenantByWebhookToken: vi.fn(),
  resolveTenantByOrganization: vi.fn(),
  resolveOrganizationIdForUser: vi.fn(),
  resolveConnection: vi.fn(),
  resolveConnectionByWebhookKey: vi.fn(),
  runLeadConversationWorkflow: vi.fn(async () => undefined),
  findByWhatsApp: vi.fn(),
  saveLeadMessage: vi.fn(async () => undefined),
}));

vi.mock('@/lib/services/tenant-resolver.service', () => ({
  resolveTenantByWebhookToken: mocks.resolveTenantByWebhookToken,
  resolveTenantByOrganization: mocks.resolveTenantByOrganization,
  isFinalizationCommand: (m: string) => m.trim().toLowerCase() === '#finalizado',
}));
vi.mock('@/lib/connectors/org-context', () => ({
  resolveOrganizationIdForUser: mocks.resolveOrganizationIdForUser,
}));
vi.mock('@/lib/connectors/resolve-connection', () => ({
  resolveConnection: mocks.resolveConnection,
  resolveConnectionByWebhookKey: mocks.resolveConnectionByWebhookKey,
}));
vi.mock('@/lib/workflows/lead-conversation.workflow', () => ({
  runLeadConversationWorkflow: mocks.runLeadConversationWorkflow,
}));
vi.mock('@/lib/repositories/lead.repository', () => ({
  leadRepository: { findByWhatsApp: mocks.findByWhatsApp },
}));
vi.mock('@/lib/repositories/conversation.repository', () => ({
  conversationRepository: { saveLeadMessage: mocks.saveLeadMessage },
}));
vi.mock('@/lib/services/lead.service', () => ({
  leadService: { recordConsultantActivity: vi.fn(async () => undefined) },
}));

import { isWellFormedWebhookToken, safeEqual, verifyMetaSignature } from '@/lib/webhooks/webhook-token';
import { setWhatsAppProviderFactoryForTests, type OrgWhatsApp } from '@/lib/integrations/whatsapp/org-whatsapp';
import { ConnectionNotConfiguredError } from '@/lib/connectors/types';
import { processInboundWhatsAppEvent } from '@/lib/webhooks/whatsapp-inbound.handler';
import type { InboundMessageEvent } from '@/lib/webhooks/normalizers/inbound-event';
import { POST as legacyPost, GET as legacyGet } from '../../app/api/webhooks/evolution/route';
import { POST as tokenPost, GET as tokenGet } from '../../app/api/webhooks/evolution/[token]/route';

const TOKEN_A = 'a'.repeat(32) + '0123456789abcdef0123456789abcdef';
const USER_A = '00000000-0000-0000-0000-00000000000a';
const ORG_A = '0a0a0a0a-0000-0000-0000-00000000000a';
const TENANT_A = { userId: USER_A, companyName: 'Org A', agentEnabled: true };

const EVO_CONN = {
  id: 'conn-evo-a',
  organizationId: ORG_A,
  category: 'whatsapp',
  provider: 'evolution',
  credentialSource: 'own',
  config: { baseUrl: 'https://evo.example.com', instanceName: 'instancia-a' },
  secret: { apiKey: 'evo-key-a' },
};
const META_CONN = {
  id: 'conn-meta-a',
  organizationId: ORG_A,
  category: 'whatsapp',
  provider: 'meta_cloud',
  credentialSource: 'own',
  config: { phoneNumberId: 'PN-A', apiVersion: 'v20.0' },
  secret: { accessToken: 'tok', appSecret: 'app-secret-da-conexao', verifyToken: 'verify-da-conexao' },
};

function evolutionPayload(instance: string, fromMe = false) {
  return {
    event: 'messages.upsert',
    instance,
    data: {
      key: { remoteJid: '5511999990000@s.whatsapp.net', fromMe, id: 'msg-1' },
      pushName: 'Fulano',
      message: { conversation: 'oi' },
    },
  };
}

function metaBody() {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: 'PN-A' },
              messages: [{ from: '5511999990000', id: 'wamid.1', timestamp: '1730000000', type: 'text', text: { body: 'oi' } }],
            },
          },
        ],
      },
    ],
  });
}

const sign = (body: string, secret: string) => 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

function req(body: unknown, headers: Record<string, string> = {}, token = TOKEN_A) {
  return new NextRequest(`http://x/api/webhooks/evolution/${token}`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
}
const postToken = (r: NextRequest, token = TOKEN_A) => tokenPost(r, { params: { token } });

let logSpies: Array<ReturnType<typeof vi.spyOn>> = [];
beforeEach(() => {
  pending.length = 0;
  vi.clearAllMocks();
  mocks.resolveTenantByWebhookToken.mockResolvedValue(TENANT_A);
  mocks.resolveOrganizationIdForUser.mockResolvedValue(ORG_A);
  mocks.resolveConnection.mockResolvedValue(EVO_CONN);
  mocks.resolveTenantByOrganization.mockResolvedValue(TENANT_A);
  logSpies = [
    vi.spyOn(console, 'log').mockImplementation(() => undefined),
    vi.spyOn(console, 'warn').mockImplementation(() => undefined),
    vi.spyOn(console, 'error').mockImplementation(() => undefined),
  ];
});
afterEach(() => {
  for (const s of logSpies) s.mockRestore();
  delete process.env.WHATSAPP_PROVIDER;
  delete process.env.META_APP_SECRET;
  delete process.env.META_WA_VERIFY_TOKEN;
});
const logged = () => JSON.stringify(logSpies.flatMap((s) => s.mock.calls));

describe('isWellFormedWebhookToken / safeEqual', () => {
  it('aceita 64 caracteres hex minúsculos', () => {
    expect(isWellFormedWebhookToken(TOKEN_A)).toBe(true);
  });
  it.each([
    ['vazio', ''],
    ['curto', 'abc'],
    ['maiúsculo', TOKEN_A.toUpperCase()],
    ['65 chars', TOKEN_A + 'a'],
    ['não-hex', 'g'.repeat(64)],
    ['injeção', `${'a'.repeat(60)}' or`],
  ])('rejeita %s', (_l, t) => {
    expect(isWellFormedWebhookToken(t)).toBe(false);
  });
  it('safeEqual compara bytes (inclusive UTF-8) e recusa tamanhos diferentes', () => {
    expect(safeEqual('ação', 'ação')).toBe(true);
    expect(safeEqual('ação', 'acao')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('verifyMetaSignature (Web Crypto HMAC-SHA256)', () => {
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
  it('assinatura correta → true; errada/ausente/malformada → false', async () => {
    expect(await verifyMetaSignature(body, sign(body, 's3cr3t'), 's3cr3t')).toBe(true);
    expect(await verifyMetaSignature(body, sign(body, 'outro'), 's3cr3t')).toBe(false);
    expect(await verifyMetaSignature(body, null, 's3cr3t')).toBe(false);
    expect(await verifyMetaSignature(body, 'sha256=zz', 's3cr3t')).toBe(false);
    expect(await verifyMetaSignature(body + ' ', sign(body, 's3cr3t'), 's3cr3t')).toBe(false);
  });
});

describe('POST /api/webhooks/evolution/[token] (legado, pela conexão da organização)', () => {
  it('token malformado → 401 sem consultar o banco', async () => {
    const res = await postToken(req(evolutionPayload('instancia-a'), {}, 'abc'), 'abc');
    expect(res.status).toBe(401);
    expect(mocks.resolveTenantByWebhookToken).not.toHaveBeenCalled();
    expect(pending).toHaveLength(0);
  });

  it('token desconhecido → 401 antes de ler o corpo', async () => {
    mocks.resolveTenantByWebhookToken.mockResolvedValueOnce(null);
    const r = req(evolutionPayload('instancia-a'), { apikey: 'evo-key-a' });
    const res = await postToken(r);
    expect(res.status).toBe(401);
    expect(r.bodyUsed).toBe(false);
    expect(mocks.resolveTenantByWebhookToken).toHaveBeenCalledWith(TOKEN_A);
  });

  it('organização sem WhatsApp ativo → 200 sem processar, log whatsapp_not_configured (sem env)', async () => {
    process.env.WHATSAPP_PROVIDER = 'evolution';
    mocks.resolveConnection.mockRejectedValueOnce(new ConnectionNotConfiguredError(ORG_A, 'whatsapp'));
    const res = await postToken(req(evolutionPayload('instancia-a'), { apikey: 'evo-key-a' }));
    expect(res.status).toBe(200);
    expect(pending).toHaveLength(0);
    expect(logged()).toContain('whatsapp_not_configured');
    expect(logged()).not.toContain('5511999990000');
  });

  it('usuário sem organização → 200 sem processar', async () => {
    mocks.resolveOrganizationIdForUser.mockResolvedValueOnce(null);
    const res = await postToken(req(evolutionPayload('instancia-a'), { apikey: 'evo-key-a' }));
    expect(res.status).toBe(200);
    expect(pending).toHaveLength(0);
    expect(mocks.resolveConnection).not.toHaveBeenCalled();
  });

  it('Evolution: instance de outra organização → 401 e nada processado', async () => {
    const res = await postToken(req(evolutionPayload('instancia-b'), { apikey: 'evo-key-a' }));
    expect(res.status).toBe(401);
    expect(pending).toHaveLength(0);
  });

  it('Evolution: apikey errada → 401', async () => {
    const res = await postToken(req(evolutionPayload('instancia-a'), { apikey: 'errada' }));
    expect(res.status).toBe(401);
    expect(pending).toHaveLength(0);
  });

  it('Evolution: fromMe com instance de outra org → 401 (não injeta mensagem de consultor)', async () => {
    const res = await postToken(req(evolutionPayload('instancia-b', true), { apikey: 'evo-key-a' }));
    expect(res.status).toBe(401);
    expect(pending).toHaveLength(0);
    expect(mocks.saveLeadMessage).not.toHaveBeenCalled();
  });

  it('Content-Length > 1 MB → 413 sem ler o corpo', async () => {
    const r = req(evolutionPayload('instancia-a'), { apikey: 'evo-key-a', 'content-length': String(1024 * 1024 + 1) });
    const res = await postToken(r);
    expect(res.status).toBe(413);
    expect(r.bodyUsed).toBe(false);
  });

  it('corpo > 1 MB sem Content-Length confiável → 413', async () => {
    const big = JSON.stringify({ ...evolutionPayload('instancia-a'), pad: 'x'.repeat(1024 * 1024) });
    const res = await postToken(req(big, { apikey: 'evo-key-a', 'content-length': '10' }));
    expect(res.status).toBe(413);
    expect(pending).toHaveLength(0);
  });

  it('Evolution válido → 200 e workflow com o tenant da organização da conexão', async () => {
    const res = await postToken(req(evolutionPayload('instancia-a'), { apikey: 'evo-key-a' }));
    expect(res.status).toBe(200);
    await Promise.all(pending);
    expect(mocks.resolveTenantByOrganization).toHaveBeenCalledWith(ORG_A);
    expect(mocks.runLeadConversationWorkflow).toHaveBeenCalledTimes(1);
    const [normalized, tenant] = mocks.runLeadConversationWorkflow.mock.calls[0] as unknown as [
      { instanceName: string; clienteWhatsApp: string },
      typeof TENANT_A,
    ];
    expect(tenant).toEqual(TENANT_A);
    expect(normalized.instanceName).toBe('instancia-a');
    expect(normalized.clienteWhatsApp).toBe('+5511999990000');
  });

  it('Meta: assinatura com o appSecret da conexão → 200 (META_APP_SECRET do env é ignorado)', async () => {
    mocks.resolveConnection.mockResolvedValueOnce(META_CONN);
    process.env.META_APP_SECRET = 'segredo-do-env';
    const body = metaBody();
    const res = await postToken(req(body, { 'x-hub-signature-256': sign(body, 'app-secret-da-conexao') }));
    expect(res.status).toBe(200);
    await Promise.all(pending);
    expect(mocks.runLeadConversationWorkflow).toHaveBeenCalledTimes(1);
  });

  it('Meta: assinatura feita com o segredo do env → 401', async () => {
    mocks.resolveConnection.mockResolvedValueOnce(META_CONN);
    process.env.META_APP_SECRET = 'segredo-do-env';
    const body = metaBody();
    const res = await postToken(req(body, { 'x-hub-signature-256': sign(body, 'segredo-do-env') }));
    expect(res.status).toBe(401);
    expect(pending).toHaveLength(0);
  });
});

describe('GET de verificação Meta', () => {
  const query = (vt: string) => `?hub.mode=subscribe&hub.verify_token=${vt}&hub.challenge=42`;

  it('rota com token usa o verifyToken da conexão da organização', async () => {
    mocks.resolveConnection.mockResolvedValue(META_CONN);
    const ok = await tokenGet(new NextRequest(`http://x/api/webhooks/evolution/${TOKEN_A}${query('verify-da-conexao')}`), {
      params: { token: TOKEN_A },
    });
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('42');
  });

  it('META_WA_VERIFY_TOKEN do env não autentica', async () => {
    process.env.META_WA_VERIFY_TOKEN = 'verif-env';
    mocks.resolveConnection.mockResolvedValue(META_CONN);
    const res = await tokenGet(new NextRequest(`http://x/api/webhooks/evolution/${TOKEN_A}${query('verif-env')}`), {
      params: { token: TOKEN_A },
    });
    expect(res.status).toBe(403);
    const semToken = await legacyGet(new NextRequest(`http://x/api/webhooks/evolution${query('verif-env')}`));
    expect(semToken.status).toBe(403);
  });

  it('rota sem token: health check sem dizer o provedor', async () => {
    const res = await legacyGet(new NextRequest('http://x/api/webhooks/evolution'));
    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).not.toContain('provider');
  });
});

describe('POST /api/webhooks/evolution (rota antiga, sem token)', () => {
  it('responde 401 e não processa nada', async () => {
    const res = await legacyPost(
      new NextRequest('http://x/api/webhooks/evolution', { method: 'POST', body: JSON.stringify(evolutionPayload('x')) })
    );
    expect(res.status).toBe(401);
    expect(mocks.resolveTenantByWebhookToken).not.toHaveBeenCalled();
    expect(pending).toHaveLength(0);
  });
});

describe('processInboundWhatsAppEvent (processamento comum)', () => {
  const ORG_SEM_WA = '0c0c0c0c-0000-0000-0000-00000000000c';
  const event = (over: Partial<InboundMessageEvent> = {}): InboundMessageEvent => ({
    organizationId: ORG_A,
    connectionId: 'conn-a',
    provider: 'evolution',
    from: '5511999990000',
    messageId: 'msg-1',
    timestamp: 1730000000,
    type: 'text',
    text: 'oi',
    fromMe: false,
    recipientId: 'instancia-a',
    ...over,
  });
  const sendText = vi.fn(async () => ({ success: true }));
  const humanLead = {
    id: 'lead-1',
    whatsapp: '+5511999990000',
    modo_atendimento: 'humano',
    consultor_responsavel: 'Ana',
    data_ultima_acao_consultor: null,
    organization_id: ORG_A,
    user_id: USER_A,
  };

  beforeEach(() => {
    sendText.mockClear();
    setWhatsAppProviderFactoryForTests(async (orgId: string): Promise<OrgWhatsApp> => {
      if (orgId !== ORG_A) throw new ConnectionNotConfiguredError(orgId, 'whatsapp');
      return {
        provider: { sendText } as unknown as OrgWhatsApp['provider'],
        target: 'inst-da-conexao',
        connectionId: 'conn-a',
        organizationId: ORG_A,
      };
    });
  });
  afterEach(() => setWhatsAppProviderFactoryForTests(null));

  it('organização sem membro → não roda o workflow; log só com código e org', async () => {
    mocks.resolveTenantByOrganization.mockResolvedValueOnce(null);
    await processInboundWhatsAppEvent({ organizationId: ORG_A, connectionId: 'conn-a', event: event() });
    expect(mocks.runLeadConversationWorkflow).not.toHaveBeenCalled();
    expect(logged()).toContain('organization_without_member');
    expect(logged()).not.toContain('5511999990000');
  });

  it('tipo não suportado (vídeo) → não roda o workflow nem resolve tenant', async () => {
    await processInboundWhatsAppEvent({ organizationId: ORG_A, connectionId: 'conn-a', event: event({ type: 'video' }) });
    expect(mocks.runLeadConversationWorkflow).not.toHaveBeenCalled();
    expect(mocks.resolveTenantByOrganization).not.toHaveBeenCalled();
  });

  it('fromMe: busca o lead pelo usuário do tenant e envia a tag pela conexão da organização', async () => {
    mocks.findByWhatsApp.mockResolvedValueOnce(humanLead);
    await processInboundWhatsAppEvent({ organizationId: ORG_A, connectionId: 'conn-a', event: event({ fromMe: true }) });
    expect(mocks.findByWhatsApp).toHaveBeenCalledWith('+5511999990000', USER_A);
    expect(sendText).toHaveBeenCalledWith('inst-da-conexao', '5511999990000', '[Consultor Ana entrou na conversa]');
    expect(mocks.runLeadConversationWorkflow).not.toHaveBeenCalled();
  });

  it('fromMe com organização sem conexão → não envia a tag, mas salva a mensagem do consultor', async () => {
    mocks.findByWhatsApp.mockResolvedValueOnce(humanLead);
    await processInboundWhatsAppEvent({ organizationId: ORG_SEM_WA, connectionId: 'conn-c', event: event({ fromMe: true, organizationId: ORG_SEM_WA }) });
    expect(sendText).not.toHaveBeenCalled();
    expect(mocks.saveLeadMessage).toHaveBeenCalledWith(expect.objectContaining({ message: '[Consultor] oi' }));
    expect(logged()).toContain('whatsapp_not_configured');
    expect(logged()).not.toContain('5511999990000');
  });

  it('falha ao capturar mensagem do consultor: log só com a mensagem do erro (LGPD-S1-01)', async () => {
    const erro = Object.assign(new Error('falha no banco'), { details: { whatsapp: '5511999990000' } });
    mocks.findByWhatsApp.mockRejectedValueOnce(erro);
    await processInboundWhatsAppEvent({ organizationId: ORG_A, connectionId: 'conn-a', event: event({ fromMe: true }) });
    const warn = logSpies[1].mock.calls.find((c) => String(c[0]).includes('consultor'));
    expect(warn).toBeDefined();
    expect(warn?.every((arg) => typeof arg === 'string')).toBe(true);
    expect(logged()).not.toContain('5511999990000');
  });
});
