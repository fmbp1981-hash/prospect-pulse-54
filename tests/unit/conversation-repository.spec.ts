/**
 * MT-04 — conversationRepository usa service_role (sem RLS): getHistory e
 * saveAgentResponse filtram por lead_id E pelo user_id do tenant.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, filterValue, type FakeCall, type FakeResult } from './helpers/fake-supabase';

const TENANT = '00000000-0000-0000-0000-00000000000a';
let pendingRows: Array<{ id: string }> = [{ id: 'row-1' }];

function handler(call: FakeCall): FakeResult | undefined {
  if (call.table === 'whatsapp_conversations' && call.op === 'select' && call.columns === 'id') {
    return { data: pendingRows, error: null };
  }
  if (call.table === 'whatsapp_conversations' && call.op === 'select') {
    return { data: [{ message_lead: 'oi', message_agent: 'olá', timestamp: null, created_at: '2026-10-30T00:00:00Z', status: 'respondido' }], error: null };
  }
  return undefined;
}

const fake = createFakeSupabase(handler);
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));

import { conversationRepository } from '@/lib/repositories/conversation.repository';

beforeEach(() => {
  fake.calls.length = 0;
  pendingRows = [{ id: 'row-1' }];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-teste';
});

describe('conversationRepository (MT-04)', () => {
  it('getHistory filtra por lead_id e user_id do tenant', async () => {
    const entries = await conversationRepository.getHistory('lead-1', TENANT, 20);
    expect(entries).toHaveLength(2);
    const call = fake.calls[0];
    expect(filterValue(call, 'lead_id')).toBe('lead-1');
    expect(filterValue(call, 'user_id')).toBe(TENANT);
  });

  it('getHistory sem userId → erro, sem consultar o banco', async () => {
    await expect(conversationRepository.getHistory('lead-1', '', 20)).rejects.toThrow();
    expect(fake.calls).toHaveLength(0);
  });

  it('saveAgentResponse procura e atualiza só linhas do tenant', async () => {
    await conversationRepository.saveAgentResponse('lead-1', 'resposta', TENANT);
    const [find, update] = fake.calls;
    expect(find.op).toBe('select');
    expect(filterValue(find, 'lead_id')).toBe('lead-1');
    expect(filterValue(find, 'user_id')).toBe(TENANT);
    expect(update.op).toBe('update');
    expect(filterValue(update, 'id')).toBe('row-1');
    expect(filterValue(update, 'user_id')).toBe(TENANT);
  });

  it('saveAgentResponse sem linha pendente do tenant → insere com user_id do tenant', async () => {
    pendingRows = [];
    await conversationRepository.saveAgentResponse('lead-1', 'resposta', TENANT);
    const insert = fake.calls.find((c) => c.op === 'insert');
    expect(insert?.payload).toMatchObject({ lead_id: 'lead-1', user_id: TENANT });
  });

  it('saveAgentResponse sem userId → erro, sem tocar no banco', async () => {
    await expect(conversationRepository.saveAgentResponse('lead-1', 'x', '')).rejects.toThrow();
    expect(fake.calls).toHaveLength(0);
  });
});
