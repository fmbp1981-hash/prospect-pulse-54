/**
 * LGPD-S1-01 — /api/admin/test-email: o e-mail de destino não vai mais na
 * query string (fica em logs de acesso/proxy). Agora é POST com corpo
 * `{ to }` validado por Zod (e-mail); GET não existe mais.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import * as route from '../../app/api/admin/test-email/route';
import { PlatformEmailNotConfiguredError } from '@/lib/connectors/email/get-email-sender';

const mocks = vi.hoisted(() => ({ getPlatformEmailSender: vi.fn(), sendBatch: vi.fn() }));

vi.mock('@/lib/connectors/email/get-email-sender', async (orig) => ({
  ...(await orig<typeof import('@/lib/connectors/email/get-email-sender')>()),
  getPlatformEmailSender: mocks.getPlatformEmailSender,
}));
vi.mock('@/lib/auth/cron-auth', () => ({ verifyCronRequest: () => true }));

function post(body: unknown) {
  return new NextRequest('http://x/api/admin/test-email', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json', authorization: 'Bearer s' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendBatch.mockResolvedValue({ sent: 1, failed: 0, ids: ['msg-1'] });
  mocks.getPlatformEmailSender.mockResolvedValue({ from: 'IntelliX.AI <noreply@intellixai.com.br>', sendBatch: mocks.sendBatch });
});
afterEach(() => vi.clearAllMocks());

describe('POST /api/admin/test-email', () => {
  it('não exporta mais GET (destinatário fora da URL)', () => {
    expect('GET' in route).toBe(false);
  });

  it.each([
    ['sem corpo', ''],
    ['sem to', {}],
    ['to inválido', { to: 'nao-e-email' }],
    ['to com @ mas inválido', { to: 'a@' }],
    ['campo extra', { to: 'dest@exemplo.com', cc: 'x@y.com' }],
  ])('%s → 400 sem resolver credencial nem enviar', async (_l, body) => {
    const res = await route.POST(post(body));
    expect(res.status).toBe(400);
    expect(mocks.getPlatformEmailSender).not.toHaveBeenCalled();
    expect(mocks.sendBatch).not.toHaveBeenCalled();
  });

  it('to válido no corpo → envia pelo remetente da plataforma', async () => {
    const res = await route.POST(post({ to: 'dest@exemplo.com' }));
    expect(res.status).toBe(200);
    expect(mocks.getPlatformEmailSender).toHaveBeenCalledTimes(1);
    expect(mocks.sendBatch.mock.calls[0][0][0].to).toBe('dest@exemplo.com');
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, messageId: 'msg-1', from: 'IntelliX.AI <noreply@intellixai.com.br>' });
  });

  it('sem credencial da plataforma → 422 com erro claro, sem enviar', async () => {
    mocks.getPlatformEmailSender.mockRejectedValue(new PlatformEmailNotConfiguredError('credencial da plataforma ausente'));
    const res = await route.POST(post({ to: 'dest@exemplo.com' }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe('PLATFORM_EMAIL_NOT_CONFIGURED');
    expect(mocks.sendBatch).not.toHaveBeenCalled();
  });

  it('provedor recusa → 502', async () => {
    mocks.sendBatch.mockResolvedValue({ sent: 0, failed: 1, ids: [] });
    const res = await route.POST(post({ to: 'dest@exemplo.com' }));
    expect(res.status).toBe(502);
  });
});
