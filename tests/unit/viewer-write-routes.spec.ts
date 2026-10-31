/**
 * F-13 — usuário com role 'visualizador' não escreve nas rotas que usam
 * service_role (que ignora RLS). Cada grupo de rota devolve 403 FORBIDDEN e
 * não toca em nenhuma tabela de negócio.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, type FakeCall, type FakeResult } from './helpers/fake-supabase';

const VIEWER = '00000000-0000-0000-0000-0000000000f1';
const AUTH_TABLES = new Set(['platform_admins', 'organization_members', 'user_settings']);

function handler(call: FakeCall): FakeResult | undefined {
  if (call.table === 'platform_admins') return { data: null, error: null };
  if (call.table === 'organization_members') return { data: [{ role: 'visualizador' }], error: null };
  return undefined;
}

const fake = createFakeSupabase(handler);
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: VIEWER } } }) } }),
}));
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [] }) }));

import { POST as campaignsPost } from '../../app/api/campaigns/route';
import { PATCH as campaignPatch } from '../../app/api/campaigns/[id]/route';
import { POST as campaignSend } from '../../app/api/campaigns/[id]/send/route';
import { POST as clientesPost } from '../../app/api/clientes/route';
import { PATCH as clientePatch, DELETE as clienteDelete } from '../../app/api/clientes/[id]/route';
import { POST as clientesConverter } from '../../app/api/clientes/converter/route';
import { POST as clienteDevolver } from '../../app/api/clientes/[id]/devolver/route';
import { POST as inboxSend } from '../../app/api/inbox/send-message/route';
import { POST as inboxTakeover } from '../../app/api/inbox/takeover/route';
import { POST as inboxReturn } from '../../app/api/inbox/return-to-bot/route';
import { POST as leadsPost } from '../../app/api/leads/route';
import { POST as emailBulk } from '../../app/api/email/send-bulk/route';
import { POST as webhookKeyPost } from '../../app/api/webhook-keys/route';
import { DELETE as webhookKeyDelete } from '../../app/api/webhook-keys/[id]/route';

const ID = '00000000-0000-0000-0000-000000000001';
const ctx = { params: { id: ID } };

function req(method: string, body: unknown = {}) {
  return new NextRequest('http://x/api/test', {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

async function expectForbidden(res: Response) {
  expect(res.status).toBe(403);
  const json = await res.json();
  expect(json.error.code).toBe('FORBIDDEN');
  expect(typeof json.error.message).toBe('string');
  const business = fake.calls.filter((c) => !AUTH_TABLES.has(c.table));
  expect(business).toHaveLength(0);
}

beforeEach(() => {
  fake.calls.length = 0;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-teste';
});

describe('F-13 — visualizador recebe 403 nas rotas de escrita', () => {
  it('campanhas: POST / PATCH / send', async () => {
    await expectForbidden(await campaignsPost(req('POST', { name: 'x' })));
    await expectForbidden(await campaignPatch(req('PATCH', { name: 'y' }), ctx));
    await expectForbidden(await campaignSend(req('POST'), ctx));
  });

  it('clientes: POST / PATCH / DELETE / converter / devolver', async () => {
    await expectForbidden(await clientesPost(req('POST', { empresa: 'x' })));
    await expectForbidden(await clientePatch(req('PATCH', { empresa: 'y' }), ctx));
    await expectForbidden(await clienteDelete(req('DELETE'), ctx));
    await expectForbidden(await clientesConverter(req('POST', { leadId: ID })));
    await expectForbidden(await clienteDevolver(req('POST'), ctx));
  });

  it('inbox: send-message / takeover / return-to-bot', async () => {
    await expectForbidden(await inboxSend(req('POST', { leadId: ID, message: 'oi' })));
    await expectForbidden(await inboxTakeover(req('POST', { leadId: ID })));
    await expectForbidden(await inboxReturn(req('POST', { leadId: ID })));
  });

  it('leads: POST', async () => {
    await expectForbidden(await leadsPost(req('POST', { empresa: 'x' })));
  });

  it('email: send-bulk', async () => {
    await expectForbidden(await emailBulk(req('POST', { leadIds: [ID], subject: 's', htmlBody: '<p>b</p>' })));
  });

  it('webhook-keys: POST / DELETE', async () => {
    await expectForbidden(await webhookKeyPost(req('POST', { name: 'k' })));
    await expectForbidden(await webhookKeyDelete(req('DELETE'), ctx));
  });
});
