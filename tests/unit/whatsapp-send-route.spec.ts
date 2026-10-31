/**
 * POST /api/whatsapp/send — envio pela conexão de WhatsApp da organização.
 *
 * Histórico: T9-C1 (credenciais do usuário misturadas com as globais) e S1-F-01
 * (SSRF pela URL Evolution do tenant). Sprint 2b (Task 5): a rota não lê mais
 * user_settings nem variáveis de ambiente; a organização vem de
 * resolveOrganizationIdForUser(user.id) e o envio sai pela conexão ativa dela
 * (getWhatsAppForOrganization). Sem conexão → 409 WHATSAPP_NOT_CONFIGURED.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { OrgWhatsApp } from '@/lib/integrations/whatsapp/org-whatsapp';
import { ConnectionNotConfiguredError } from '@/lib/connectors/types';

const USER = '00000000-0000-0000-0000-00000000000a';
const ORG_A = '0a0a0a0a-0000-0000-0000-00000000000a';
const ORG_META = '0d0d0d0d-0000-0000-0000-00000000000d';
const ORG_SEM_WA = '0c0c0c0c-0000-0000-0000-00000000000c';

const mocks = vi.hoisted(() => ({
  findOrgForUser: vi.fn(),
  sendText: vi.fn(),
  sendMedia: vi.fn(),
  userSettingsRead: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
    from: (table: string) => {
      mocks.userSettingsRead(table);
      throw new Error(`leitura inesperada de ${table}`);
    },
  }),
}));
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [] }) }));
// RBAC (F-13) é coberto em require-writer.spec.ts / viewer-write-routes.spec.ts.
vi.mock('@/lib/auth/require-writer', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/require-writer')>()),
  requireWriter: async () => true,
}));
vi.mock('@/lib/repositories/connections.repository', () => ({
  connectionsRepository: { findOrganizationIdForUser: mocks.findOrgForUser },
}));

import { POST } from '../../app/api/whatsapp/send/route';
import { setWhatsAppProviderFactoryForTests } from '@/lib/integrations/whatsapp/org-whatsapp';

const factory = vi.fn(async (orgId: string): Promise<OrgWhatsApp> => {
  if (orgId === ORG_A || orgId === ORG_META) {
    return {
      provider: {
        name: orgId === ORG_A ? 'evolution' : 'meta-cloud',
        sendText: mocks.sendText,
        sendMedia: mocks.sendMedia,
      } as unknown as OrgWhatsApp['provider'],
      target: orgId === ORG_A ? 'inst-org-a' : 'phone-id-meta',
      connectionId: `conn-${orgId}`,
      organizationId: orgId,
    };
  }
  throw new ConnectionNotConfiguredError(orgId, 'whatsapp');
});

const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));

function post(body: unknown) {
  return new NextRequest('http://x/api/whatsapp/send', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}
const BODY = { whatsapp: '+55 81 99999-0001', message: 'oi' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  setWhatsAppProviderFactoryForTests(factory);
  process.env.EVOLUTION_API_URL = 'https://evolution-global.plataforma';
  process.env.EVOLUTION_API_KEY = 'CHAVE-GLOBAL-SECRETA';
  process.env.WHATSAPP_PROVIDER = 'evolution';
  mocks.findOrgForUser.mockResolvedValue(ORG_A);
  mocks.sendText.mockResolvedValue({ success: true, messageId: 'm1' });
  mocks.sendMedia.mockResolvedValue({ success: true, messageId: 'm2' });
});
afterEach(() => {
  vi.unstubAllGlobals();
  setWhatsAppProviderFactoryForTests(null);
  delete process.env.WHATSAPP_PROVIDER;
});

describe('envio pela conexão da organização', () => {
  it('texto → sendText no alvo da conexão da org do usuário, número só com dígitos', async () => {
    const res = await POST(post(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mocks.findOrgForUser).toHaveBeenCalledWith(USER);
    expect(factory).toHaveBeenCalledWith(ORG_A);
    expect(mocks.sendText).toHaveBeenCalledWith('inst-org-a', '5581999990001', 'oi');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.userSettingsRead).not.toHaveBeenCalled();
  });

  it('mídia → sendMedia com legenda e metadados', async () => {
    const res = await POST(post({
      whatsapp: '5581999990001',
      message: 'legenda',
      mediaBase64: 'AAAA',
      mediaMimetype: 'image/png',
      mediaFileName: 'a.png',
      mediaType: 'image',
    }));
    expect(res.status).toBe(200);
    expect(mocks.sendMedia).toHaveBeenCalledWith('inst-org-a', '5581999990001', {
      type: 'image',
      base64: 'AAAA',
      url: undefined,
      mimetype: 'image/png',
      fileName: 'a.png',
      caption: 'legenda',
    });
    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it('conexão Meta com mídia sem URL pública → 400 e nada enviado', async () => {
    mocks.findOrgForUser.mockResolvedValue(ORG_META);
    const res = await POST(post({ whatsapp: '5581999990001', mediaBase64: 'AAAA' }));
    expect(res.status).toBe(400);
    expect(mocks.sendMedia).not.toHaveBeenCalled();
  });
});

describe('sem conexão', () => {
  it('org sem conexão de WhatsApp → 409 WHATSAPP_NOT_CONFIGURED e nada enviado (sem env)', async () => {
    mocks.findOrgForUser.mockResolvedValue(ORG_SEM_WA);
    const res = await POST(post(BODY));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: {
        code: 'WHATSAPP_NOT_CONFIGURED',
        message: 'WhatsApp não configurado para esta organização. Fale com a equipe IntelliX.',
      },
    });
    expect(mocks.sendText).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('usuário sem organização → 409 e nada enviado', async () => {
    mocks.findOrgForUser.mockResolvedValue(null);
    const res = await POST(post(BODY));
    expect(res.status).toBe(409);
    expect(factory).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('validação e vazamento de erro', () => {
  it.each([
    [{ message: 'oi' }],
    [{ whatsapp: '  ', message: 'oi' }],
    [{ whatsapp: '5581999990001' }],
    [{ whatsapp: '5581999990001', message: 'oi', mediaType: 'audio', mediaUrl: 'https://x.test/a' }],
  ])('corpo inválido %j → 400', async (body) => {
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it('falha do provedor → 500 com mensagem genérica; log sem telefone nem detalhe', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.sendText.mockResolvedValue({ success: false, error: 'Evolution sendText failed: 502 DETALHE-INTERNO' });
    const res = await POST(post(BODY));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('DETALHE-INTERNO');
    const logged = JSON.stringify(errSpy.mock.calls);
    expect(logged).toContain(ORG_A);
    expect(logged).not.toContain('99999');
    errSpy.mockRestore();
  });

  it('exceção ao resolver a conexão → 503 genérico, sem a mensagem do erro', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    factory.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.5:8080'));
    const res = await POST(post(BODY));
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain('ECONNREFUSED');
    errSpy.mockRestore();
  });
});
