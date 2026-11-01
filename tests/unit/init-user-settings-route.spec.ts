/**
 * S1-F-02 + S1-F-04 — POST /api/admin/init-user-settings.
 *
 * Organização + membership só nascem no fluxo de signup: usuário SEM linha
 * prévia em user_settings E sem membership. Chamadas repetidas não criam
 * organização nova. Não existe mais tratamento especial por e-mail
 * (PLATFORM_ADMIN_EMAIL): admin da plataforma é só public.platform_admins.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, type FakeCall, type FakeResult } from './helpers/fake-supabase';

const USER = '00000000-0000-0000-0000-0000000000a1';
const ADMIN_EMAIL = 'dono@plataforma.test';
// Antes da correção a rota lia PLATFORM_ADMIN_EMAIL no carregamento do módulo.
vi.hoisted(() => { process.env.PLATFORM_ADMIN_EMAIL = 'dono@plataforma.test'; });

let hasSettings = false;
let hasMembership = false;
let upsertInserts = true;
let callerEmail = 'usuario@empresa.test';

function handler(call: FakeCall): FakeResult | undefined {
  if (call.table === 'user_settings' && call.op === 'select') {
    return { data: hasSettings ? { user_id: USER } : null, error: null };
  }
  if (call.table === 'user_settings' && call.op === 'upsert') {
    return { data: upsertInserts ? [{ user_id: USER }] : [], error: null };
  }
  if (call.table === 'organization_members' && call.op === 'select') {
    return { data: hasMembership ? { id: 'm1' } : null, error: null };
  }
  if (call.table === 'organizations' && call.op === 'insert') {
    return { data: { id: 'org-nova' }, error: null };
  }
  return undefined;
}

const fake = createFakeSupabase(handler);
const getUserById = vi.fn(async () => ({ data: { user: { id: USER, email: callerEmail } }, error: null }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    ...fake.client,
    auth: {
      getUser: async () => ({ data: { user: { id: USER, email: callerEmail } }, error: null }),
      admin: { getUserById },
    },
  }),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => ({ limited: false }),
  getClientIp: () => '127.0.0.1',
}));

import { POST } from '../../app/api/admin/init-user-settings/route';

function post(body: unknown) {
  return new NextRequest('http://x/api/admin/init-user-settings', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', authorization: 'Bearer token-do-usuario' },
  });
}

const writes = () => fake.calls.filter((c) => c.op !== 'select');

beforeEach(() => {
  fake.calls.length = 0;
  getUserById.mockClear();
  hasSettings = false;
  hasMembership = false;
  upsertInserts = true;
  callerEmail = 'usuario@empresa.test';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-de-teste';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-teste';
  process.env.PLATFORM_ADMIN_EMAIL = ADMIN_EMAIL;
});
afterEach(() => {
  delete process.env.PLATFORM_ADMIN_EMAIL;
});

describe('init-user-settings', () => {
  it('signup novo (sem user_settings e sem membership) → cria settings pendente, organização e membership admin', async () => {
    const res = await POST(post({ userId: USER, companyName: 'Empresa Nova' }));
    expect(res.status).toBe(200);
    const w = writes();
    expect(w.map((c) => `${c.table}:${c.op}`)).toEqual([
      'user_settings:upsert',
      'organizations:insert',
      'organization_members:insert',
    ]);
    expect(w[0].payload).toMatchObject({ user_id: USER, role: 'visualizador', pending_setup: true });
    expect(w[2].payload).toMatchObject({ organization_id: 'org-nova', user_id: USER, role: 'admin' });
  });

  it('S1-F-02: chamada repetida (user_settings já existe) → não cria organização nem membership', async () => {
    hasSettings = true;
    const res = await POST(post({ userId: USER, companyName: 'Outra Empresa' }));
    expect(res.status).toBe(200);
    expect(writes()).toEqual([]);
  });

  it('S1-F-02: user_settings existe mas membership não (usuário removido da org) → não cria organização', async () => {
    hasSettings = true;
    hasMembership = false;
    await POST(post({ userId: USER }));
    expect(fake.calls.some((c) => c.table === 'organizations')).toBe(false);
    expect(fake.calls.some((c) => c.table === 'organization_members' && c.op === 'insert')).toBe(false);
  });

  it('sem user_settings mas já membro → cria só user_settings, sem organização nova', async () => {
    hasMembership = true;
    await POST(post({ userId: USER }));
    expect(writes().map((c) => `${c.table}:${c.op}`)).toEqual(['user_settings:upsert']);
  });

  it('corrida: upsert não inseriu (linha criada por outra chamada) → não cria organização', async () => {
    upsertInserts = false;
    await POST(post({ userId: USER }));
    expect(fake.calls.some((c) => c.table === 'organizations')).toBe(false);
  });

  it('S1-F-04: e-mail igual ao antigo PLATFORM_ADMIN_EMAIL não vira admin nem pula a organização', async () => {
    callerEmail = ADMIN_EMAIL;
    await POST(post({ userId: USER }));
    const w = writes();
    expect(w[0].payload).toMatchObject({ role: 'visualizador', pending_setup: true });
    expect(w.some((c) => JSON.stringify(c.payload).includes('"role":"admin"') && c.table === 'user_settings')).toBe(false);
    expect(getUserById).not.toHaveBeenCalled();
  });
});
