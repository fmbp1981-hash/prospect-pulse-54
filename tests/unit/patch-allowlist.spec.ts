/**
 * F-06 (High) — PATCH /api/campaigns/[id] e /api/clientes/[id] gravavam o body
 * inteiro com service_role (só removiam user_id/id). Com isso o dono movia a
 * linha para outra organização (organization_id) ou alterava colunas internas.
 * Agora: Zod .strict() com allowlist; campo fora da lista → 400 e nada gravado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, filterValue, type FakeCall, type FakeResult } from './helpers/fake-supabase';

const USER_A = '00000000-0000-0000-0000-00000000000a';
const ORG_B = '10000000-0000-0000-0000-00000000000b';
const ROW_ID = '50000000-0000-0000-0000-000000000001';

function handler(call: FakeCall): FakeResult | undefined {
  if (call.table === 'campaigns' && call.op === 'select') {
    return { data: { status: 'draft' }, error: null };
  }
  if (call.op === 'update') {
    return { data: { id: filterValue(call, 'id'), ...(call.payload as object) }, error: null };
  }
  return undefined;
}

const fake = createFakeSupabase(handler);

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: USER_A } } }) } }),
}));
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [] }) }));

import { PATCH as patchCampaign } from '../../app/api/campaigns/[id]/route';
import { PATCH as patchCliente } from '../../app/api/clientes/[id]/route';

function patch(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const updates = () => fake.calls.filter((c) => c.op === 'update');
const params = { params: { id: ROW_ID } };

beforeEach(() => {
  fake.calls.length = 0;
});

describe('PATCH /api/campaigns/[id]', () => {
  it.each([
    ['organization_id', { name: 'X', organization_id: ORG_B }],
    ['user_id', { user_id: '00000000-0000-0000-0000-00000000000b' }],
    ['status', { status: 'sending' }],
    ['total_sent', { total_sent: 999 }],
    ['channel', { channel: 'whatsapp' }],
  ])('campo fora da allowlist (%s) → 400 e nada gravado', async (_c, body) => {
    const res = await patchCampaign(patch(`http://x/api/campaigns/${ROW_ID}`, body), params);
    expect(res.status).toBe(400);
    expect(updates()).toHaveLength(0);
  });

  it('campos permitidos → 200 e grava só eles (+ updated_at), filtrando por user_id', async () => {
    const body = {
      name: 'Campanha',
      description: 'desc',
      subject: 'Assunto',
      body: 'Olá {{nome}}',
      audience_filter: { status: 'Novo Lead' },
      scheduled_at: '2026-11-01T12:00:00.000Z',
    };
    const res = await patchCampaign(patch(`http://x/api/campaigns/${ROW_ID}`, body), params);
    expect(res.status).toBe(200);
    const upd = updates()[0];
    expect(Object.keys(upd.payload as object).sort()).toEqual([...Object.keys(body), 'updated_at'].sort());
    expect(filterValue(upd, 'user_id')).toBe(USER_A);
  });

  it('body que não é objeto → 400', async () => {
    const res = await patchCampaign(patch(`http://x/api/campaigns/${ROW_ID}`, ['x']), params);
    expect(res.status).toBe(400);
    expect(updates()).toHaveLength(0);
  });
});

describe('PATCH /api/clientes/[id]', () => {
  it.each([
    ['organization_id', { empresa: 'X', organization_id: ORG_B }],
    ['user_id', { user_id: '00000000-0000-0000-0000-00000000000b' }],
    ['lead_id_original', { lead_id_original: 'lead-de-outro-tenant' }],
    ['created_at', { created_at: '2000-01-01T00:00:00Z' }],
  ])('campo fora da allowlist (%s) → 400 e nada gravado', async (_c, body) => {
    const res = await patchCliente(patch(`http://x/api/clientes/${ROW_ID}`, body), params);
    expect(res.status).toBe(400);
    expect(updates()).toHaveLength(0);
  });

  it('campos de contato/empresa → 200 e grava só eles (+ updated_at)', async () => {
    const body = {
      empresa: 'Empresa',
      contato: 'Fulano',
      whatsapp: '+5581999990000',
      email: 'f@exemplo.com',
      cidade: 'Recife',
      observacoes: 'obs',
      tags: ['vip'],
      faturamento_declarado: 1000,
    };
    const res = await patchCliente(patch(`http://x/api/clientes/${ROW_ID}`, body), params);
    expect(res.status).toBe(200);
    const upd = updates()[0];
    expect(Object.keys(upd.payload as object).sort()).toEqual([...Object.keys(body), 'updated_at'].sort());
    expect(filterValue(upd, 'user_id')).toBe(USER_A);
  });

  it('empresa vazia → 400', async () => {
    const res = await patchCliente(patch(`http://x/api/clientes/${ROW_ID}`, { empresa: '   ' }), params);
    expect(res.status).toBe(400);
    expect(updates()).toHaveLength(0);
  });
});
