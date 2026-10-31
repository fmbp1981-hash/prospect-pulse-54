/**
 * F-12 — inbox/send-message e inbox/takeover caíam para a instância global
 * (EVOLUTION_INSTANCE_NAME) quando o usuário não tinha instância: a mensagem
 * saía pelo número de outra organização. Agora a instância vem só de
 * resolveInstanceForUser(user.id); sem instância → send-message 400 e o
 * takeover troca o modo sem enviar nada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, type FakeCall, type FakeResult } from './helpers/fake-supabase';

const USER_A = '00000000-0000-0000-0000-00000000000a';
const USER_SEM_INST = '00000000-0000-0000-0000-00000000000c';
const LEAD = '60000000-0000-0000-0000-000000000001';

let currentUser: { id: string; email: string; user_metadata: Record<string, unknown> } = {
  id: USER_A,
  email: 'a@exemplo.com',
  user_metadata: {},
};

function handler(call: FakeCall): FakeResult | undefined {
  if (call.table === 'leads_prospeccao' && call.op === 'select') {
    return {
      data: { id: LEAD, whatsapp: '+55 81 99999-0001', user_id: currentUser.id, modo_atendimento: 'bot', data_ultima_acao_consultor: null },
      error: null,
    };
  }
  if (call.table === 'user_settings' && call.op === 'select') {
    return { data: null, error: { message: 'no rows', code: 'PGRST116' } };
  }
  return undefined;
}
const fake = createFakeSupabase(handler);

const mocks = vi.hoisted(() => ({
  sendText: vi.fn(async () => undefined),
  resolveInstanceForUser: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: currentUser } }) } }),
}));
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [] }) }));
// RBAC (F-13) é coberto em require-writer.spec.ts / viewer-write-routes.spec.ts.
vi.mock('@/lib/auth/require-writer', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/require-writer')>()),
  requireWriter: async () => true,
}));
vi.mock('@/lib/integrations/whatsapp/whatsapp.factory', () => ({
  getWhatsAppProvider: () => ({ sendText: mocks.sendText }),
}));
vi.mock('@/lib/services/tenant-resolver.service', () => ({
  resolveInstanceForUser: mocks.resolveInstanceForUser,
}));

import { POST as sendMessage } from '../../app/api/inbox/send-message/route';
import { POST as takeover } from '../../app/api/inbox/takeover/route';

function post(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  fake.calls.length = 0;
  vi.clearAllMocks();
  process.env.EVOLUTION_INSTANCE_NAME = 'inst-global-de-outra-org';
  mocks.resolveInstanceForUser.mockImplementation(async (uid: string) => (uid === USER_A ? 'inst-org-a' : null));
  currentUser = { id: USER_A, email: 'a@exemplo.com', user_metadata: {} };
});

describe('F-12 — inbox/send-message', () => {
  it('usuário sem instância → 400 e nada enviado (sem fallback global)', async () => {
    currentUser = { ...currentUser, id: USER_SEM_INST };
    const res = await sendMessage(post('http://x/api/inbox/send-message', { leadId: LEAD, message: 'oi' }));
    expect(res.status).toBe(400);
    expect(mocks.sendText).not.toHaveBeenCalled();
    expect(fake.calls.some((c) => c.op === 'insert')).toBe(false);
  });

  it('usuário com instância → envia pela instância dele', async () => {
    const res = await sendMessage(post('http://x/api/inbox/send-message', { leadId: LEAD, message: 'oi' }));
    expect(res.status).toBe(200);
    expect(mocks.resolveInstanceForUser).toHaveBeenCalledWith(USER_A);
    expect(mocks.sendText).toHaveBeenCalledWith('inst-org-a', '5581999990001', 'oi');
  });
});

describe('F-12 — inbox/takeover', () => {
  it('usuário sem instância → assume a conversa mas não envia pela instância global', async () => {
    currentUser = { ...currentUser, id: USER_SEM_INST };
    const res = await takeover(post('http://x/api/inbox/takeover', { leadId: LEAD }));
    expect(res.status).toBe(200);
    expect(mocks.sendText).not.toHaveBeenCalled();
    const upd = fake.calls.find((c) => c.table === 'leads_prospeccao' && c.op === 'update');
    expect((upd?.payload as { modo_atendimento: string }).modo_atendimento).toBe('humano');
  });

  it('usuário com instância → notifica pela instância dele', async () => {
    const res = await takeover(post('http://x/api/inbox/takeover', { leadId: LEAD }));
    expect(res.status).toBe(200);
    expect(mocks.sendText).toHaveBeenCalledTimes(1);
    expect(mocks.sendText.mock.calls[0][0]).toBe('inst-org-a');
  });
});
