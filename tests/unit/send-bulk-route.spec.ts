/**
 * Task 7 — /api/email/send-bulk envia pela conexão de e-mail da organização.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, type FakeCall, type FakeResult } from './helpers/fake-supabase';
import { ConnectionNotConfiguredError } from '@/lib/connectors/types';

const USER = '00000000-0000-0000-0000-00000000000a';
const ORG_A = '0a0a0a0a-0000-0000-0000-00000000000a';
const ORG_SEM = '0c0c0c0c-0000-0000-0000-00000000000c';

function handler(call: FakeCall): FakeResult | undefined {
  if (call.table === 'leads_prospeccao' && call.op === 'select') {
    return { data: [{ id: 'l1', email: 'lead@x.com', empresa: 'Emp', contato: 'Ana' }], error: null };
  }
  return undefined;
}
const fake = createFakeSupabase(handler);
const mocks = vi.hoisted(() => ({ findOrgForUser: vi.fn(), sendBatch: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: USER } } }) } }),
}));
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [] }) }));
vi.mock('@/lib/auth/require-writer', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/require-writer')>()),
  requireWriter: async () => true,
}));
vi.mock('@/lib/repositories/connections.repository', () => ({
  connectionsRepository: { findOrganizationIdForUser: mocks.findOrgForUser },
}));
vi.mock('@/lib/connectors/email/get-email-sender', async (orig) => ({
  ...(await orig<typeof import('@/lib/connectors/email/get-email-sender')>()),
  getEmailSenderForOrganization: async (orgId: string) => {
    if (orgId === ORG_A) return { from: 'A <c@a.com>', sendBatch: mocks.sendBatch };
    throw new ConnectionNotConfiguredError(orgId, 'email');
  },
}));

import { POST } from '../../app/api/email/send-bulk/route';

const fetchMock = vi.fn();
function call() {
  return POST(new NextRequest('http://x/api/email/send-bulk', {
    method: 'POST',
    body: JSON.stringify({ leadIds: ['l1'], subject: 'Oi {{nome}}', htmlBody: '<p>{{empresa}}</p>' }),
    headers: { 'content-type': 'application/json' },
  }));
}

beforeEach(() => {
  fake.calls.length = 0;
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-teste';
  process.env.RESEND_API_KEY = 're_ENV_NAO_USAR';
  mocks.findOrgForUser.mockResolvedValue(ORG_A);
  mocks.sendBatch.mockResolvedValue({ sent: 1, failed: 0, ids: ['e1'] });
});

describe('POST /api/email/send-bulk', () => {
  it('envia pela conexão da organização e marca o lead como enviado', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(mocks.sendBatch).toHaveBeenCalledWith([
      { to: 'lead@x.com', subject: 'Oi Ana', html: '<p>Emp</p>' },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fake.calls.some((c) => c.table === 'user_settings')).toBe(false);
  });

  it('org sem conexão de e-mail → 409 EMAIL_NOT_CONFIGURED sem tocar nos leads', async () => {
    mocks.findOrgForUser.mockResolvedValue(ORG_SEM);
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('EMAIL_NOT_CONFIGURED');
    expect(mocks.sendBatch).not.toHaveBeenCalled();
    expect(fake.calls.length).toBe(0);
  });

  it('usuário sem organização → 409', async () => {
    mocks.findOrgForUser.mockResolvedValue(null);
    expect((await call()).status).toBe(409);
  });
});
