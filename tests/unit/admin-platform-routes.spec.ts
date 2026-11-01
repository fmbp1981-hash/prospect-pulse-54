/**
 * F-03 (High) e F-14 (Medium) — rotas /api/admin/{list-users,approve-user,
 * reject-user,delete-user}.
 *
 * Admin da PLATAFORMA = linha em public.platform_admins (allowlist da Task 6b).
 * `user_settings.role = 'admin'` sozinho (ex.: admin de organização) não basta:
 * 403 sem tocar em nenhum dado. approve-user não promove ninguém a admin
 * (`newRole: 'admin'` → 400). list-users não devolve segredos (evolution_api_key).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, filterValue, type FakeCall, type FakeResult } from './helpers/fake-supabase';

const PLATFORM_ADMIN = '00000000-0000-0000-0000-0000000000aa';
const ORG_ADMIN = '00000000-0000-0000-0000-0000000000bb';
const TARGET = '00000000-0000-0000-0000-0000000000cc';

let currentUser: { id: string } | null = null;
const platformAdmins = new Set<string>([PLATFORM_ADMIN]);

const FULL_SETTINGS_ROW: Record<string, unknown> = {
  user_id: TARGET,
  role: 'visualizador',
  pending_setup: true,
  rejected: false,
  company_name: 'Empresa Alvo',
  created_at: '2026-10-01T00:00:00Z',
  integration_configured: false,
  user_webhook_url: null,
  evolution_api_url: 'https://evo.exemplo',
  evolution_api_key: 'SEGREDO-EVOLUTION',
  evolution_instance_name: 'inst-alvo',
  whatsapp_webhook_url: null,
  openai_api_key: 'SEGREDO-OPENAI',
  webhook_token: 'f'.repeat(64),
};

function pick(row: Record<string, unknown>, columns: string | undefined): Record<string, unknown> {
  if (!columns || columns.trim() === '*') return { ...row };
  const out: Record<string, unknown> = {};
  for (const c of columns.split(',').map((s) => s.trim()).filter(Boolean)) out[c] = row[c];
  return out;
}

function handler(call: FakeCall): FakeResult | undefined {
  if (call.table === 'platform_admins') {
    const uid = filterValue(call, 'user_id') as string;
    return { data: platformAdmins.has(uid) ? { user_id: uid } : null, error: null };
  }
  if (call.table === 'user_settings' && call.op === 'select') {
    const uid = filterValue(call, 'user_id') as string | undefined;
    if (uid) {
      // Admin de organização e admin da plataforma têm role 'admin' em user_settings.
      return { data: { role: 'admin' }, error: null };
    }
    return { data: [pick(FULL_SETTINGS_ROW, call.columns)], error: null };
  }
  if (call.table === 'user_settings' && call.op === 'update') {
    return { data: call.returning ? { user_id: filterValue(call, 'user_id') } : null, error: null };
  }
  return undefined;
}

const fake = createFakeSupabase(handler);
const authAdmin = {
  listUsers: vi.fn(async () => ({
    data: { users: [{ id: TARGET, email: 'alvo@exemplo.com', user_metadata: {} }] },
    error: null,
  })),
  getUserById: vi.fn(async (id: string) => ({
    data: { user: { id, email: 'alvo@exemplo.com', user_metadata: {} } },
    error: null,
  })),
  deleteUser: vi.fn(async () => ({ data: {}, error: null })),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ ...fake.client, auth: { admin: authAdmin } }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
  }),
}));

import { GET as listUsers } from '../../app/api/admin/list-users/route';
import { POST as approveUser } from '../../app/api/admin/approve-user/route';
import { POST as rejectUser } from '../../app/api/admin/reject-user/route';
import { POST as deleteUser } from '../../app/api/admin/delete-user/route';

function post(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const writes = () => fake.calls.filter((c) => c.op !== 'select');

beforeEach(() => {
  fake.calls.length = 0;
  vi.clearAllMocks();
  currentUser = null;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-teste';
  delete process.env.RESEND_API_KEY;
});

describe('F-03 — admin de organização (role admin sem platform_admins) → 403', () => {
  beforeEach(() => {
    currentUser = { id: ORG_ADMIN };
  });

  it('list-users → 403 e não lista ninguém', async () => {
    const res = await listUsers();
    expect(res.status).toBe(403);
    expect(authAdmin.listUsers).not.toHaveBeenCalled();
  });

  it('approve-user → 403 e nada gravado', async () => {
    const res = await approveUser(post('http://x/api/admin/approve-user', { userId: TARGET, newRole: 'operador' }));
    expect(res.status).toBe(403);
    expect(writes()).toHaveLength(0);
  });

  it('reject-user → 403 e nada gravado', async () => {
    const res = await rejectUser(post('http://x/api/admin/reject-user', { userId: TARGET }));
    expect(res.status).toBe(403);
    expect(writes()).toHaveLength(0);
  });

  it('delete-user → 403 e ninguém excluído', async () => {
    const res = await deleteUser(post('http://x/api/admin/delete-user', { userId: TARGET }));
    expect(res.status).toBe(403);
    expect(writes()).toHaveLength(0);
    expect(authAdmin.deleteUser).not.toHaveBeenCalled();
  });
});

describe('F-03 — admin da plataforma (platform_admins)', () => {
  beforeEach(() => {
    currentUser = { id: PLATFORM_ADMIN };
  });

  it('a autorização consulta platform_admins pelo id do chamador', async () => {
    await listUsers();
    const check = fake.calls.find((c) => c.table === 'platform_admins');
    expect(check).toBeDefined();
    expect(filterValue(check as FakeCall, 'user_id')).toBe(PLATFORM_ADMIN);
  });

  it('approve-user com newRole admin → 400 e nada gravado', async () => {
    const res = await approveUser(post('http://x/api/admin/approve-user', { userId: TARGET, newRole: 'admin' }));
    expect(res.status).toBe(400);
    expect(writes()).toHaveLength(0);
  });

  it('approve-user com operador → 200 e grava no alvo', async () => {
    const res = await approveUser(post('http://x/api/admin/approve-user', { userId: TARGET, newRole: 'operador' }));
    expect(res.status).toBe(200);
    const upd = writes().find((c) => c.table === 'user_settings' && c.op === 'update');
    expect(upd).toBeDefined();
    expect(filterValue(upd as FakeCall, 'user_id')).toBe(TARGET);
    expect((upd?.payload as { role: string }).role).toBe('operador');
  });

  it('reject-user → 200', async () => {
    const res = await rejectUser(post('http://x/api/admin/reject-user', { userId: TARGET }));
    expect(res.status).toBe(200);
  });

  it('delete-user (pendente) → 200', async () => {
    const res = await deleteUser(post('http://x/api/admin/delete-user', { userId: TARGET }));
    expect(res.status).toBe(200);
    expect(authAdmin.deleteUser).toHaveBeenCalledWith(TARGET);
  });
});

describe('F-14 — list-users não devolve segredos', () => {
  it('não seleciona nem devolve evolution_api_key', async () => {
    currentUser = { id: PLATFORM_ADMIN };
    const res = await listUsers();
    expect(res.status).toBe(200);
    const listCall = fake.calls.find(
      (c) => c.table === 'user_settings' && c.op === 'select' && !filterValue(c, 'user_id')
    );
    expect(listCall?.columns).toBeDefined();
    expect(listCall?.columns).not.toMatch(/evolution_api_key|openai_api_key|webhook_token|\*/);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('SEGREDO-EVOLUTION');
    expect(text).not.toContain('evolution_api_key');
  });
});

describe('sem sessão', () => {
  it('list-users → 401', async () => {
    const res = await listUsers();
    expect(res.status).toBe(401);
  });
});
