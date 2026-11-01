/**
 * LGPD-S1-01 — /api/admin/test-email: o e-mail de destino não vai mais na
 * query string (fica em logs de acesso/proxy). Agora é POST com corpo
 * `{ to }` validado por Zod (e-mail); GET não existe mais.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import * as route from '../../app/api/admin/test-email/route';

const supabaseTouched = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    supabaseTouched();
    return {
      auth: { admin: { listUsers: async () => ({ data: { users: [{ id: 'u1', email: 'contato@intellixai.com.br' }] }, error: null }) } },
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: { resend_api_key: 're_teste', from_email: 'a@b.com', company_name: 'X' }, error: null }) }) }),
      }),
    };
  },
}));
vi.mock('@/lib/auth/cron-auth', () => ({ verifyCronRequest: () => true }));

const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'msg-1' }), { status: 200 }));

function post(body: unknown) {
  return new NextRequest('http://x/api/admin/test-email', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json', authorization: 'Bearer s' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

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
  ])('%s → 400 sem tocar no banco nem enviar', async (_l, body) => {
    const res = await route.POST(post(body));
    expect(res.status).toBe(400);
    expect(supabaseTouched).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('to válido no corpo → envia', async () => {
    const res = await route.POST(post({ to: 'dest@exemplo.com' }));
    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).to).toEqual(['dest@exemplo.com']);
  });
});
