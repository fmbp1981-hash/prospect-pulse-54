/**
 * Task 7 (Sprint 2b) — e-mail pela conexão da organização.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConnectionNotConfiguredError } from '@/lib/connectors/types';

const mocks = vi.hoisted(() => ({
  resolveConnection: vi.fn(),
  recordUsage: vi.fn(),
  getPlatformCredential: vi.fn(),
  decryptJson: vi.fn(),
}));

vi.mock('@/lib/connectors/resolve-connection', () => ({ resolveConnection: mocks.resolveConnection }));
vi.mock('@/lib/connectors/usage', () => ({ recordUsage: mocks.recordUsage }));
vi.mock('@/lib/connectors/crypto/secret-box', () => ({ decryptJson: mocks.decryptJson }));
vi.mock('@/lib/repositories/connections.repository', () => ({
  connectionsRepository: { getPlatformCredential: mocks.getPlatformCredential },
}));

import {
  getEmailSenderForOrganization,
  getPlatformEmailSender,
  PlatformEmailNotConfiguredError,
} from '@/lib/connectors/email/get-email-sender';
import { checkResendDomainVerified } from '@/lib/connectors/email/resend.adapter';

const ORG = '0a0a0a0a-0000-0000-0000-00000000000a';
const fetchMock = vi.fn();

function conn(domain: string, apiKey = 're_org') {
  return {
    id: 'conn-1',
    organizationId: ORG,
    category: 'email',
    provider: 'resend',
    credentialSource: 'own',
    config: { domain, fromEmail: `contato@${domain}`, fromName: 'Clínica X' },
    secret: { apiKey },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockImplementation(async () =>
    new Response(JSON.stringify({ data: [{ id: 'e1' }, { id: 'e2' }] }), { status: 200 })
  );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('getEmailSenderForOrganization', () => {
  it('from usa o domínio da organização e envia com a chave da conexão', async () => {
    mocks.resolveConnection.mockResolvedValue(conn('clinicax.com.br'));
    const sender = await getEmailSenderForOrganization(ORG);
    expect(mocks.resolveConnection).toHaveBeenCalledWith(ORG, 'email');
    expect(sender.from).toBe('Clínica X <contato@clinicax.com.br>');

    const result = await sender.sendBatch([
      { to: 'a@x.com', subject: 'S', html: '<p>1</p>' },
      { to: 'b@x.com', subject: 'S', html: '<p>2</p>', replyTo: 'r@clinicax.com.br' },
    ]);
    expect(result).toEqual({ sent: 2, failed: 0, ids: ['e1', 'e2'] });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails/batch');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_org');
    const body = JSON.parse(String(init.body));
    expect(body[0].from).toBe('Clínica X <contato@clinicax.com.br>');
    expect(body[0].to).toEqual(['a@x.com']);
    expect(body[1].reply_to).toBe('r@clinicax.com.br');
  });

  it('registra consumo em emails com a quantidade enviada', async () => {
    mocks.resolveConnection.mockResolvedValue(conn('clinicax.com.br'));
    const sender = await getEmailSenderForOrganization(ORG);
    await sender.sendBatch([
      { to: 'a@x.com', subject: 'S', html: 'h' },
      { to: 'b@x.com', subject: 'S', html: 'h' },
    ]);
    expect(mocks.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, provider: 'resend', unit: 'emails', quantity: 2 })
    );
  });

  it('falha do provedor conta como failed, sem consumo e sem expor conteúdo', async () => {
    fetchMock.mockResolvedValue(new Response('{"message":"boom a@x.com"}', { status: 422 }));
    mocks.resolveConnection.mockResolvedValue(conn('clinicax.com.br'));
    const sender = await getEmailSenderForOrganization(ORG);
    const result = await sender.sendBatch([{ to: 'a@x.com', subject: 'S', html: 'h' }]);
    expect(result).toEqual({ sent: 0, failed: 1, ids: [] });
    expect(mocks.recordUsage).not.toHaveBeenCalled();
  });

  it('divide em lotes de 100 (limite da Resend)', async () => {
    mocks.resolveConnection.mockResolvedValue(conn('clinicax.com.br'));
    fetchMock.mockImplementation(async (_u: string, init: RequestInit) => {
      const n = JSON.parse(String(init.body)).length;
      return new Response(JSON.stringify({ data: Array.from({ length: n }, (_, i) => ({ id: `i${i}` })) }), { status: 200 });
    });
    const sender = await getEmailSenderForOrganization(ORG);
    const msgs = Array.from({ length: 150 }, (_, i) => ({ to: `u${i}@x.com`, subject: 'S', html: 'h' }));
    const result = await sender.sendBatch(msgs);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.sent).toBe(150);
  });

  it('org sem conexão de e-mail propaga ConnectionNotConfiguredError (sem fetch)', async () => {
    mocks.resolveConnection.mockRejectedValue(new ConnectionNotConfiguredError(ORG, 'email'));
    await expect(getEmailSenderForOrganization(ORG)).rejects.toBeInstanceOf(ConnectionNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('org A nunca usa a conexão da org B: resolve sempre pelo organizationId recebido', async () => {
    const ORG_B = '0b0b0b0b-0000-0000-0000-00000000000b';
    mocks.resolveConnection.mockImplementation(async (orgId: string) =>
      orgId === ORG ? conn('a.com.br', 're_a') : conn('b.com.br', 're_b')
    );
    const a = await getEmailSenderForOrganization(ORG);
    const b = await getEmailSenderForOrganization(ORG_B);
    expect(a.from).toContain('@a.com.br');
    expect(b.from).toContain('@b.com.br');
    await a.sendBatch([{ to: 'x@x.com', subject: 'S', html: 'h' }]);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_a');
  });
});

describe('getPlatformEmailSender', () => {
  it('usa platform_credentials.resend com fromEmail/fromName da própria credencial', async () => {
    mocks.getPlatformCredential.mockResolvedValue({
      provider: 'resend',
      secret: { enc: 'x' },
      config: { fromEmail: 'noreply@intellixai.com.br', fromName: 'IntelliX.AI' },
    });
    mocks.decryptJson.mockResolvedValue({ apiKey: 're_plat' });
    const sender = await getPlatformEmailSender();
    expect(mocks.getPlatformCredential).toHaveBeenCalledWith('resend');
    expect(sender.from).toBe('IntelliX.AI <noreply@intellixai.com.br>');
    await sender.sendBatch([{ to: 'u@x.com', subject: 'S', html: 'h' }]);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_plat');
  });

  it('sem credencial da plataforma → erro claro', async () => {
    mocks.getPlatformCredential.mockResolvedValue(null);
    await expect(getPlatformEmailSender()).rejects.toBeInstanceOf(PlatformEmailNotConfiguredError);
  });

  it('config sem fromEmail/fromName → erro claro', async () => {
    mocks.getPlatformCredential.mockResolvedValue({ provider: 'resend', secret: {}, config: {} });
    mocks.decryptJson.mockResolvedValue({ apiKey: 're_plat' });
    await expect(getPlatformEmailSender()).rejects.toBeInstanceOf(PlatformEmailNotConfiguredError);
  });
});

describe('checkResendDomainVerified', () => {
  const domains = (status: string) =>
    new Response(JSON.stringify({ data: [{ name: 'clinicax.com.br', status }, { name: 'outro.com', status: 'verified' }] }), { status: 200 });

  it('true para domínio verified', async () => {
    fetchMock.mockResolvedValue(domains('verified'));
    expect(await checkResendDomainVerified('re_k', 'clinicax.com.br')).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.resend.com/domains');
  });

  it('false para status pending', async () => {
    fetchMock.mockResolvedValue(domains('pending'));
    expect(await checkResendDomainVerified('re_k', 'clinicax.com.br')).toBe(false);
  });

  it('false para domínio ausente, resposta de erro ou falha de rede', async () => {
    fetchMock.mockResolvedValue(domains('verified'));
    expect(await checkResendDomainVerified('re_k', 'naoexiste.com')).toBe(false);
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    expect(await checkResendDomainVerified('re_k', 'clinicax.com.br')).toBe(false);
    fetchMock.mockRejectedValue(new Error('net'));
    expect(await checkResendDomainVerified('re_k', 'clinicax.com.br')).toBe(false);
  });
});
