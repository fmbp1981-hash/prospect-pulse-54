/**
 * Registro de consumo: nunca lança e grava na organização certa.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakeSupabase } from './helpers/fake-supabase';

const state = vi.hoisted(() => ({ fake: null as unknown }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => (state.fake as { client: unknown }).client),
}));

import { recordUsage } from '@/lib/connectors/usage';
import { connectionsRepository } from '@/lib/repositories/connections.repository';

const event = {
  organizationId: '11111111-1111-1111-1111-111111111111',
  category: 'llm' as const,
  provider: 'openai' as const,
  operation: 'chat.completions',
  quantity: 120,
  unit: 'tokens' as const,
  connectionId: 'conn-1',
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
});

afterEach(() => vi.restoreAllMocks());

describe('recordUsage', () => {
  it('insere o evento em usage_events', async () => {
    const fake = createFakeSupabase(() => ({ data: null, error: null }));
    state.fake = fake;
    await recordUsage(event);
    expect(fake.calls[0].table).toBe('usage_events');
    expect(fake.calls[0].op).toBe('insert');
    expect(fake.calls[0].payload).toMatchObject({
      organization_id: event.organizationId,
      provider: 'openai',
      quantity: 120,
      unit: 'tokens',
      connection_id: 'conn-1',
    });
  });

  it('insert falhando não lança e loga', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    state.fake = createFakeSupabase(() => ({ data: null, error: { message: 'db down' } }));
    await expect(recordUsage(event)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });

  it('exceção do cliente também não lança', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    state.fake = {
      client: {
        from: () => {
          throw new Error('boom');
        },
      },
    };
    await expect(recordUsage(event)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });
});

describe('connectionsRepository.listForOrganization', () => {
  it('seleciona colunas explícitas, sem secret nem webhook_key, filtrando a organização', async () => {
    const fake = createFakeSupabase(() => ({ data: [], error: null }));
    state.fake = fake;
    await connectionsRepository.listForOrganization(event.organizationId);
    const call = fake.calls[0];
    expect(call.columns).not.toContain('*');
    expect(call.columns).not.toMatch(/secret|webhook_key/);
    expect(call.filters).toContainEqual({ kind: 'eq', column: 'organization_id', value: event.organizationId });
  });
});
