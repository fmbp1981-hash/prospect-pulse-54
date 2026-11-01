/**
 * F-02 (Crítico) — webhook do WhatsApp autenticado por token por tenant.
 *
 * O tenant vem SEMPRE do token do path (/api/webhooks/evolution/<token>),
 * nunca do campo `instance` do payload. Token malformado ou desconhecido → 401
 * sem processar nada; token válido com `instance` de outro tenant → 403.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';

const pending: Promise<unknown>[] = [];

vi.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => {
    pending.push(p);
  },
}));

const resolveTenantByWebhookToken = vi.fn();
const resolveTenantByInstance = vi.fn();
vi.mock('@/lib/services/tenant-resolver.service', () => ({
  resolveTenantByWebhookToken: (...a: unknown[]) => resolveTenantByWebhookToken(...a),
  resolveTenantByInstance: (...a: unknown[]) => resolveTenantByInstance(...a),
  isFinalizationCommand: (m: string) => m.trim().toLowerCase() === '#finalizado',
}));

const runLeadConversationWorkflow = vi.fn(async () => undefined);
vi.mock('@/lib/workflows/lead-conversation.workflow', () => ({
  runLeadConversationWorkflow: (...a: unknown[]) => runLeadConversationWorkflow(...(a as [])),
}));

const findByWhatsApp = vi.fn();
vi.mock('@/lib/repositories/lead.repository', () => ({
  leadRepository: { findByWhatsApp: (...a: unknown[]) => findByWhatsApp(...a) },
}));
const saveLeadMessage = vi.fn(async () => undefined);
vi.mock('@/lib/repositories/conversation.repository', () => ({
  conversationRepository: { saveLeadMessage: (...a: unknown[]) => saveLeadMessage(...(a as [])) },
}));
vi.mock('@/lib/services/lead.service', () => ({
  leadService: { recordConsultantActivity: vi.fn(async () => undefined) },
}));

import { isWellFormedWebhookToken, verifyMetaSignature } from '@/lib/webhooks/webhook-token';
import { handleWhatsAppInboundPost } from '@/lib/webhooks/whatsapp-inbound.handler';
import { POST as legacyPost } from '../../app/api/webhooks/evolution/route';
import { POST as tokenPost, GET as tokenGet } from '../../app/api/webhooks/evolution/[token]/route';

const TOKEN_A = 'a'.repeat(32) + '0123456789abcdef0123456789abcdef';
const TENANT_A = {
  userId: '00000000-0000-0000-0000-00000000000a',
  companyName: 'Org A',
  instanceName: 'instancia-a',
  agentEnabled: true,
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

function req(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
}

beforeEach(() => {
  pending.length = 0;
  vi.clearAllMocks();
  delete process.env.WHATSAPP_PROVIDER;
  delete process.env.META_APP_SECRET;
  delete process.env.META_WA_VERIFY_TOKEN;
});

describe('isWellFormedWebhookToken', () => {
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
});

describe('POST /api/webhooks/evolution/[token]', () => {
  it('token malformado → 401 sem consultar o banco nem processar', async () => {
    const res = await handleWhatsAppInboundPost(
      req('http://x/api/webhooks/evolution/abc', evolutionPayload('instancia-a')),
      'abc'
    );
    expect(res.status).toBe(401);
    expect(resolveTenantByWebhookToken).not.toHaveBeenCalled();
    expect(runLeadConversationWorkflow).not.toHaveBeenCalled();
    expect(pending).toHaveLength(0);
  });

  it('token desconhecido → 401 e nada processado', async () => {
    resolveTenantByWebhookToken.mockResolvedValueOnce(null);
    const res = await handleWhatsAppInboundPost(
      req(`http://x/api/webhooks/evolution/${TOKEN_A}`, evolutionPayload('instancia-a')),
      TOKEN_A
    );
    expect(res.status).toBe(401);
    expect(resolveTenantByWebhookToken).toHaveBeenCalledWith(TOKEN_A);
    expect(runLeadConversationWorkflow).not.toHaveBeenCalled();
    expect(pending).toHaveLength(0);
  });

  it('token da Org A com instance da Org B → 403 e nada processado', async () => {
    resolveTenantByWebhookToken.mockResolvedValueOnce(TENANT_A);
    const res = await handleWhatsAppInboundPost(
      req(`http://x/api/webhooks/evolution/${TOKEN_A}`, evolutionPayload('instancia-b')),
      TOKEN_A
    );
    expect(res.status).toBe(403);
    expect(runLeadConversationWorkflow).not.toHaveBeenCalled();
    expect(pending).toHaveLength(0);
  });

  it('tenant sem instância configurada → 403 e nada processado', async () => {
    resolveTenantByWebhookToken.mockResolvedValueOnce({ ...TENANT_A, instanceName: '' });
    const res = await handleWhatsAppInboundPost(
      req(`http://x/api/webhooks/evolution/${TOKEN_A}`, evolutionPayload('')),
      TOKEN_A
    );
    expect(res.status).toBe(403);
    expect(runLeadConversationWorkflow).not.toHaveBeenCalled();
    expect(pending).toHaveLength(0);
  });

  it('token desconhecido → 401 antes de ler o corpo', async () => {
    resolveTenantByWebhookToken.mockResolvedValueOnce(null);
    const r = req(`http://x/api/webhooks/evolution/${TOKEN_A}`, evolutionPayload('instancia-a'));
    const res = await handleWhatsAppInboundPost(r, TOKEN_A);
    expect(res.status).toBe(401);
    expect(r.bodyUsed).toBe(false);
  });

  it('Content-Length > 1 MB → 413 sem ler o corpo', async () => {
    resolveTenantByWebhookToken.mockResolvedValueOnce(TENANT_A);
    const r = req(`http://x/api/webhooks/evolution/${TOKEN_A}`, evolutionPayload('instancia-a'), {
      'content-length': String(1024 * 1024 + 1),
    });
    const res = await handleWhatsAppInboundPost(r, TOKEN_A);
    expect(res.status).toBe(413);
    expect(r.bodyUsed).toBe(false);
    expect(pending).toHaveLength(0);
  });

  it('corpo > 1 MB sem Content-Length confiável → 413', async () => {
    resolveTenantByWebhookToken.mockResolvedValueOnce(TENANT_A);
    const big = JSON.stringify({ ...evolutionPayload('instancia-a'), pad: 'x'.repeat(1024 * 1024) });
    const res = await handleWhatsAppInboundPost(
      req(`http://x/api/webhooks/evolution/${TOKEN_A}`, big, { 'content-length': '10' }),
      TOKEN_A
    );
    expect(res.status).toBe(413);
    expect(pending).toHaveLength(0);
  });

  it('fromMe com instance de outro tenant → 403 (não injeta mensagem de consultor)', async () => {
    resolveTenantByWebhookToken.mockResolvedValueOnce(TENANT_A);
    const res = await handleWhatsAppInboundPost(
      req(`http://x/api/webhooks/evolution/${TOKEN_A}`, evolutionPayload('instancia-b', true)),
      TOKEN_A
    );
    expect(res.status).toBe(403);
    expect(pending).toHaveLength(0);
    expect(saveLeadMessage).not.toHaveBeenCalled();
  });

  it('token válido e instance do próprio tenant → 200 e workflow com o tenant do token', async () => {
    resolveTenantByWebhookToken.mockResolvedValueOnce(TENANT_A);
    const res = await handleWhatsAppInboundPost(
      req(`http://x/api/webhooks/evolution/${TOKEN_A}`, evolutionPayload('instancia-a')),
      TOKEN_A
    );
    expect(res.status).toBe(200);
    await Promise.all(pending);
    expect(runLeadConversationWorkflow).toHaveBeenCalledTimes(1);
    const [normalized, tenant] = runLeadConversationWorkflow.mock.calls[0] as unknown as [
      { instanceName: string },
      typeof TENANT_A,
    ];
    expect(tenant).toEqual(TENANT_A);
    expect(normalized.instanceName).toBe('instancia-a');
    expect(resolveTenantByInstance).not.toHaveBeenCalled();
  });

  it('fromMe válido usa o tenant do token (nunca resolve por instance)', async () => {
    resolveTenantByWebhookToken.mockResolvedValueOnce(TENANT_A);
    findByWhatsApp.mockResolvedValueOnce(null);
    const res = await handleWhatsAppInboundPost(
      req(`http://x/api/webhooks/evolution/${TOKEN_A}`, evolutionPayload('instancia-a', true)),
      TOKEN_A
    );
    expect(res.status).toBe(200);
    await Promise.all(pending);
    expect(findByWhatsApp).toHaveBeenCalledWith('+5511999990000', TENANT_A.userId);
    expect(resolveTenantByInstance).not.toHaveBeenCalled();
  });

  it('a rota dinâmica repassa o token do path ao handler', async () => {
    resolveTenantByWebhookToken.mockResolvedValueOnce(null);
    const res = await tokenPost(
      req(`http://x/api/webhooks/evolution/${TOKEN_A}`, evolutionPayload('instancia-a')),
      { params: { token: TOKEN_A } }
    );
    expect(res.status).toBe(401);
    expect(resolveTenantByWebhookToken).toHaveBeenCalledWith(TOKEN_A);
  });

  it('GET de verificação Meta continua disponível na rota com token', async () => {
    process.env.META_WA_VERIFY_TOKEN = 'verif';
    const res = await tokenGet(
      new NextRequest(
        `http://x/api/webhooks/evolution/${TOKEN_A}?hub.mode=subscribe&hub.verify_token=verif&hub.challenge=42`
      )
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('42');
  });
});

describe('Meta: X-Hub-Signature-256', () => {
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
  const sig = (secret: string) => 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

  it('assinatura correta → true; errada/ausente → false', () => {
    expect(verifyMetaSignature(body, sig('s3cr3t'), 's3cr3t')).toBe(true);
    expect(verifyMetaSignature(body, sig('outro'), 's3cr3t')).toBe(false);
    expect(verifyMetaSignature(body, null, 's3cr3t')).toBe(false);
    expect(verifyMetaSignature(body, 'sha256=zz', 's3cr3t')).toBe(false);
  });

  it('provider meta com assinatura válida → 200 (passa a autenticação)', async () => {
    process.env.WHATSAPP_PROVIDER = 'meta';
    process.env.META_APP_SECRET = 's3cr3t';
    resolveTenantByWebhookToken.mockResolvedValueOnce(TENANT_A);
    const res = await handleWhatsAppInboundPost(
      req(`http://x/api/webhooks/evolution/${TOKEN_A}`, body, { 'x-hub-signature-256': sig('s3cr3t') }),
      TOKEN_A
    );
    expect(res.status).toBe(200);
    expect(resolveTenantByWebhookToken).toHaveBeenCalledWith(TOKEN_A);
  });

  it('payload Meta sem META_APP_SECRET → 503 e nada processado (fail-closed)', async () => {
    resolveTenantByWebhookToken.mockResolvedValueOnce(TENANT_A);
    const res = await handleWhatsAppInboundPost(
      req(`http://x/api/webhooks/evolution/${TOKEN_A}`, body, { 'x-hub-signature-256': sig('s3cr3t') }),
      TOKEN_A
    );
    expect(res.status).toBe(503);
    expect(pending).toHaveLength(0);
  });

  it('provider meta sem META_APP_SECRET → 503 mesmo sem header de assinatura', async () => {
    process.env.WHATSAPP_PROVIDER = 'meta';
    resolveTenantByWebhookToken.mockResolvedValueOnce(TENANT_A);
    const res = await handleWhatsAppInboundPost(
      req(`http://x/api/webhooks/evolution/${TOKEN_A}`, evolutionPayload('instancia-a')),
      TOKEN_A
    );
    expect(res.status).toBe(503);
    expect(pending).toHaveLength(0);
  });

  it('provider meta com META_APP_SECRET e assinatura inválida → 401', async () => {
    process.env.WHATSAPP_PROVIDER = 'meta';
    process.env.META_APP_SECRET = 's3cr3t';
    resolveTenantByWebhookToken.mockResolvedValueOnce(TENANT_A);
    const res = await handleWhatsAppInboundPost(
      req(`http://x/api/webhooks/evolution/${TOKEN_A}`, body, { 'x-hub-signature-256': sig('outro') }),
      TOKEN_A
    );
    expect(res.status).toBe(401);
    expect(pending).toHaveLength(0);
  });
});

describe('POST /api/webhooks/evolution (rota antiga, sem token)', () => {
  it('responde 401 e não processa nada', async () => {
    const res = await legacyPost(
      req('http://x/api/webhooks/evolution', evolutionPayload('instancia-b'))
    );
    expect(res.status).toBe(401);
    expect(resolveTenantByInstance).not.toHaveBeenCalled();
    expect(resolveTenantByWebhookToken).not.toHaveBeenCalled();
    expect(runLeadConversationWorkflow).not.toHaveBeenCalled();
    expect(pending).toHaveLength(0);
  });
});

describe('obs. de log (LGPD-S1-01) — falha ao capturar mensagem do consultor', () => {
  it('console.warn recebe só a mensagem do erro, nunca o objeto (que pode carregar payload/telefone)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const erro = Object.assign(new Error('falha no banco'), { details: { whatsapp: '5511999990000' } });
    findByWhatsApp.mockRejectedValueOnce(erro);
    resolveTenantByWebhookToken.mockResolvedValueOnce(TENANT_A);
    await handleWhatsAppInboundPost(
      req(`http://x/api/webhooks/evolution/${TOKEN_A}`, evolutionPayload('instancia-a', true)),
      TOKEN_A
    );
    await Promise.all(pending);
    const call = warn.mock.calls.find((c) => String(c[0]).includes('consultor'));
    expect(call).toBeDefined();
    expect(call?.every((arg) => typeof arg === 'string')).toBe(true);
    expect(JSON.stringify(call)).not.toContain('5511999990000');
    warn.mockRestore();
  });
});
