/**
 * Task 7 — e-mail de aprovação usa getPlatformEmailSender (remetente da
 * plataforma), nunca env RESEND_API_KEY/FROM_EMAIL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const ADMIN = '00000000-0000-0000-0000-0000000000ad';
const TARGET = '00000000-0000-0000-0000-0000000000b1';

const mocks = vi.hoisted(() => ({ getPlatformEmailSender: vi.fn(), sendBatch: vi.fn() }));

vi.mock('@/lib/connectors/email/get-email-sender', () => ({
  getPlatformEmailSender: mocks.getPlatformEmailSender,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: ADMIN } } }) } }),
}));
vi.mock('@/lib/auth/platform-admin', () => ({ isPlatformAdmin: async () => true }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'novo@cliente.com', user_metadata: { full_name: 'Novo' } } }, error: null }) } },
    from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
  }),
}));

import { POST } from '../../app/api/admin/approve-user/route';

const fetchMock = vi.fn();

function call() {
  return POST(new NextRequest('http://x/api/admin/approve-user', {
    method: 'POST',
    body: JSON.stringify({ userId: TARGET, newRole: 'operador' }),
    headers: { 'content-type': 'application/json' },
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-teste';
  process.env.RESEND_API_KEY = 're_ENV_NAO_USAR';
  mocks.sendBatch.mockResolvedValue({ sent: 1, failed: 0, ids: ['e1'] });
  mocks.getPlatformEmailSender.mockResolvedValue({ from: 'IntelliX.AI <noreply@x>', sendBatch: mocks.sendBatch });
});

describe('POST /api/admin/approve-user — e-mail de aprovação', () => {
  it('usa getPlatformEmailSender (não env nem fetch direto)', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(mocks.getPlatformEmailSender).toHaveBeenCalledTimes(1);
    expect(mocks.sendBatch.mock.calls[0][0][0]).toMatchObject({ to: 'novo@cliente.com' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('plataforma sem e-mail configurado não bloqueia a aprovação', async () => {
    mocks.getPlatformEmailSender.mockRejectedValue(new Error('sem credencial'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = await call();
    expect(res.status).toBe(200);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('novo@cliente.com');
    warn.mockRestore();
  });
});
