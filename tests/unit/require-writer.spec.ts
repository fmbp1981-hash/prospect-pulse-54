/**
 * F-13 — requireWriter: quem pode escrever nas rotas com service_role.
 * Organização: organization_members.role; sem organização: user_settings.role;
 * admin da plataforma sempre escreve; erro de consulta → false.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, filterValue, type FakeCall, type FakeResult } from './helpers/fake-supabase';

const USER = '00000000-0000-0000-0000-0000000000a1';

let memberships: Array<{ role: string }> = [];
let legacyRole: string | null = null;
let platformAdmin = false;
let memberError = false;

function handler(call: FakeCall): FakeResult | undefined {
  if (call.table === 'platform_admins') {
    const uid = filterValue(call, 'user_id') as string;
    return { data: platformAdmin ? { user_id: uid } : null, error: null };
  }
  if (call.table === 'organization_members') {
    return memberError
      ? { data: null, error: { message: 'boom' } }
      : { data: memberships, error: null };
  }
  if (call.table === 'user_settings') {
    return { data: legacyRole ? { role: legacyRole } : null, error: null };
  }
  return undefined;
}

const fake = createFakeSupabase(handler);
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));

import { requireWriter, requireOrgAdmin } from '@/lib/auth/require-writer';

beforeEach(() => {
  fake.calls.length = 0;
  memberships = [];
  legacyRole = null;
  platformAdmin = false;
  memberError = false;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-teste';
});

describe('requireWriter', () => {
  it('membro da organização com role operador → true', async () => {
    memberships = [{ role: 'operador' }];
    expect(await requireWriter(USER)).toBe(true);
  });

  it('membro da organização com role visualizador → false (mesmo com user_settings admin)', async () => {
    memberships = [{ role: 'visualizador' }];
    legacyRole = 'admin';
    expect(await requireWriter(USER)).toBe(false);
  });

  it('sem organização: user_settings.role admin → true; visualizador → false', async () => {
    legacyRole = 'admin';
    expect(await requireWriter(USER)).toBe(true);
    legacyRole = 'visualizador';
    expect(await requireWriter(USER)).toBe(false);
  });

  it('sem organização e sem user_settings → false', async () => {
    expect(await requireWriter(USER)).toBe(false);
  });

  it('admin da plataforma → true', async () => {
    platformAdmin = true;
    memberships = [{ role: 'visualizador' }];
    expect(await requireWriter(USER)).toBe(true);
  });

  it('erro ao consultar organization_members → false (falha fechada)', async () => {
    memberError = true;
    legacyRole = 'admin';
    expect(await requireWriter(USER)).toBe(false);
  });
});

describe('requireOrgAdmin', () => {
  it('admin da plataforma → true', async () => {
    platformAdmin = true;
    memberships = [{ role: 'visualizador' }];
    expect(await requireOrgAdmin(USER)).toBe(true);
  });

  it('admin da organização → true', async () => {
    memberships = [{ role: 'admin' }];
    expect(await requireOrgAdmin(USER)).toBe(true);
  });

  it('operador → false', async () => {
    memberships = [{ role: 'operador' }];
    expect(await requireOrgAdmin(USER)).toBe(false);
  });

  it('visualizador → false', async () => {
    memberships = [{ role: 'visualizador' }];
    expect(await requireOrgAdmin(USER)).toBe(false);
  });

  it('sem organização: user_settings admin → true; operador → false', async () => {
    legacyRole = 'admin';
    expect(await requireOrgAdmin(USER)).toBe(true);
    legacyRole = 'operador';
    expect(await requireOrgAdmin(USER)).toBe(false);
  });

  it('erro de consulta → false (falha fechada)', async () => {
    memberError = true;
    legacyRole = 'admin';
    expect(await requireOrgAdmin(USER)).toBe(false);
  });
});
