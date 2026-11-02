/**
 * leadRepository — leitura mínima do lead para o consumidor da fila
 * (findByIdForFollowUpJob, colunas explícitas) e reserva condicional do envio
 * (reserveFollowUpSend só reserva se o lead continua exatamente como foi lido).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Call = { method: string; args: unknown[] };

const state = vi.hoisted(() => ({
  calls: [] as Call[],
  result: { data: null as unknown, error: null as unknown },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => {
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'select', 'update', 'eq', 'in', 'is']) {
      chain[m] = (...args: unknown[]) => {
        state.calls.push({ method: m, args });
        return chain;
      };
    }
    chain.maybeSingle = () => {
      state.calls.push({ method: 'maybeSingle', args: [] });
      return Promise.resolve(state.result);
    };
    chain.then = (ok: (v: typeof state.result) => unknown) => Promise.resolve(state.result).then(ok);
    return chain;
  }),
}));

import { leadRepository, FOLLOW_UP_JOB_LEAD_COLUMNS } from '@/lib/repositories/lead.repository';

const LEAD = '11111111-1111-4111-8111-111111111111';
const READ_AT = '2026-10-29T10:00:00.123456+00:00';
const NOW = new Date('2026-11-01T12:00:00.000Z');

const callsOf = (method: string) => state.calls.filter((c) => c.method === method).map((c) => c.args);

describe('leadRepository — follow-up da fila', () => {
  beforeEach(() => {
    state.calls = [];
    state.result = { data: null, error: null };
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  });

  describe('findByIdForFollowUpJob', () => {
    it('selects only the columns the follow-up job reads (never *)', async () => {
      state.result = { data: { id: LEAD }, error: null };

      await expect(leadRepository.findByIdForFollowUpJob(LEAD)).resolves.toEqual({ id: LEAD });

      const [[columns]] = callsOf('select');
      expect(columns).not.toContain('*');
      const list = String(columns).split(',').map((c) => c.trim()).sort();
      expect(list).toEqual(
        [
          'id',
          'whatsapp',
          'follow_up_count',
          'modo_atendimento',
          'status_msg_wa',
          'data_ultima_interacao',
          'organization_id',
          'user_id',
        ].sort()
      );
      expect(String(columns)).toBe(FOLLOW_UP_JOB_LEAD_COLUMNS);
      expect(callsOf('eq')).toEqual([['id', LEAD]]);
    });

    it('null when not found; throws on db error', async () => {
      await expect(leadRepository.findByIdForFollowUpJob(LEAD)).resolves.toBeNull();
      state.result = { data: null, error: { message: 'boom' } };
      await expect(leadRepository.findByIdForFollowUpJob(LEAD)).rejects.toThrow('findByIdForFollowUpJob error: boom');
    });
  });

  describe('reserveFollowUpSend', () => {
    it('conditions on count, bot mode, conversation status and the interaction read', async () => {
      state.result = { data: [{ id: LEAD }], error: null };

      await expect(leadRepository.reserveFollowUpSend(LEAD, 1, READ_AT, NOW)).resolves.toBe(true);

      expect(callsOf('update')[0][0]).toEqual({
        follow_up_count: 2,
        data_ultima_interacao: NOW.toISOString(),
        updated_at: NOW.toISOString(),
      });
      expect(callsOf('eq')).toEqual([
        ['id', LEAD],
        ['follow_up_count', 1],
        ['modo_atendimento', 'bot'],
        ['data_ultima_interacao', READ_AT],
      ]);
      expect(callsOf('in')).toEqual([['status_msg_wa', ['Em Conversa', 'Qualificando']]]);
    });

    it('sets status Follow-up on the third send', async () => {
      state.result = { data: [{ id: LEAD }], error: null };
      await leadRepository.reserveFollowUpSend(LEAD, 2, READ_AT, NOW);
      expect(callsOf('update')[0][0]).toMatchObject({ follow_up_count: 3, status_msg_wa: 'Follow-up' });
    });

    it('false when no row matched', async () => {
      state.result = { data: [], error: null };
      await expect(leadRepository.reserveFollowUpSend(LEAD, 0, READ_AT, NOW)).resolves.toBe(false);
    });
  });
});
