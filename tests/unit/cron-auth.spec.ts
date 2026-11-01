/**
 * F-10 / F-18 — autenticação dos crons e das rotas admin com segredo.
 *
 * Regra única (verifyCronRequest): só header `Authorization: Bearer <CRON_SECRET>`,
 * comparação em tempo constante; CRON_SECRET ausente → sempre recusa (inclusive
 * `Bearer undefined`); segredo em query string (?secret=) nunca vale.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const SECRET = 'segredo-de-cron-para-teste-0123456789';

const { runFollowUpJob, runLongFollowUpJob, runSupabaseKeepAlive } = vi.hoisted(() => {
  process.env.CRON_SECRET = 'segredo-de-cron-para-teste-0123456789';
  return {
    runFollowUpJob: vi.fn(async () => undefined),
    runLongFollowUpJob: vi.fn(async () => undefined),
    runSupabaseKeepAlive: vi.fn(async () => undefined),
  };
});

vi.mock('@/lib/jobs/follow-up.job', () => ({ runFollowUpJob }));
vi.mock('@/lib/jobs/long-followup.job', () => ({ runLongFollowUpJob }));
vi.mock('@/lib/jobs/supabase-keepalive.job', () => ({ runSupabaseKeepAlive }));

const supabaseTouched = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    supabaseTouched();
    const empty = { data: [], error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'select', 'eq', 'or', 'in', 'update', 'order', 'limit']) {
      chain[m] = () => chain;
    }
    chain.then = (ok: (v: typeof empty) => unknown) => Promise.resolve(empty).then(ok);
    chain.auth = { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } };
    return chain;
  },
}));

import { verifyCronRequest } from '@/lib/auth/cron-auth';
import { GET as followUp } from '../../app/api/cron/follow-up/route';
import { GET as keepalive } from '../../app/api/cron/keepalive/route';
import { GET as longFollowUp } from '../../app/api/cron/long-followup/route';
import { GET as rescue } from '../../app/api/cron/rescue-human-mode/route';
import { GET as ragIngestGet, POST as ragIngestPost } from '../../app/api/admin/rag-ingest/route';
import { GET as registerTemplates } from '../../app/api/admin/register-templates/route';
import { POST as testEmail } from '../../app/api/admin/test-email/route';

function req(url: string, auth?: string, method = 'GET') {
  return new NextRequest(url, { method, headers: auth ? { authorization: auth } : {} });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-teste';
});

describe('verifyCronRequest', () => {
  it('aceita Bearer com o segredo correto', () => {
    expect(verifyCronRequest(req('http://x/api/cron/a', `Bearer ${SECRET}`))).toBe(true);
  });

  it.each([
    ['sem header', undefined],
    ['segredo errado (mesmo tamanho)', `Bearer ${'x'.repeat(SECRET.length)}`],
    ['segredo errado (tamanho diferente)', 'Bearer abc'],
    ['prefixo do segredo', `Bearer ${SECRET.slice(0, -1)}`],
    ['sem "Bearer "', SECRET],
    ['esquema diferente', `Basic ${SECRET}`],
    ['Bearer vazio', 'Bearer '],
  ])('recusa %s', (_l, auth) => {
    expect(verifyCronRequest(req('http://x/api/cron/a', auth))).toBe(false);
  });

  it('recusa segredo em query string', () => {
    expect(verifyCronRequest(req(`http://x/api/cron/a?secret=${SECRET}`))).toBe(false);
  });

  it('CRON_SECRET ausente → recusa até "Bearer undefined"', () => {
    delete process.env.CRON_SECRET;
    expect(verifyCronRequest(req('http://x/api/cron/a', 'Bearer undefined'))).toBe(false);
    expect(verifyCronRequest(req('http://x/api/cron/a', 'Bearer '))).toBe(false);
  });

  it('CRON_SECRET vazio → recusa', () => {
    process.env.CRON_SECRET = '';
    expect(verifyCronRequest(req('http://x/api/cron/a', 'Bearer '))).toBe(false);
  });
});

describe('rotas /api/cron/*', () => {
  it('rescue-human-mode sem CRON_SECRET e "Bearer undefined" → 401 sem tocar no banco', async () => {
    delete process.env.CRON_SECRET;
    const res = await rescue(req('http://x/api/cron/rescue-human-mode', 'Bearer undefined'));
    expect(res.status).toBe(401);
    expect(supabaseTouched).not.toHaveBeenCalled();
  });

  it('rescue-human-mode com segredo correto → não é 401', async () => {
    const res = await rescue(req('http://x/api/cron/rescue-human-mode', `Bearer ${SECRET}`));
    expect(res.status).not.toBe(401);
  });

  it.each([
    ['follow-up', followUp, runFollowUpJob],
    ['keepalive', keepalive, runSupabaseKeepAlive],
    ['long-followup', longFollowUp, runLongFollowUpJob],
  ] as const)('%s: segredo errado → 401; correto → roda o job', async (name, handler, job) => {
    const bad = await handler(req(`http://x/api/cron/${name}`, 'Bearer errado'));
    expect(bad.status).toBe(401);
    expect(job).not.toHaveBeenCalled();
    const ok = await handler(req(`http://x/api/cron/${name}`, `Bearer ${SECRET}`));
    expect(ok.status).toBe(200);
    expect(job).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['follow-up', followUp],
    ['keepalive', keepalive],
    ['long-followup', longFollowUp],
  ] as const)('%s: segredo em query string → 401', async (name, handler) => {
    const res = await handler(req(`http://x/api/cron/${name}?secret=${SECRET}`));
    expect(res.status).toBe(401);
  });
});

describe('rotas admin com segredo (sem query string)', () => {
  it.each([
    ['rag-ingest GET', ragIngestGet, 'GET'],
    ['rag-ingest POST', ragIngestPost, 'POST'],
    ['register-templates', registerTemplates, 'GET'],
    ['test-email', testEmail, 'POST'],
  ] as const)('%s com ?secret= correto e sem header → 401', async (_n, handler, method) => {
    const res = await handler(req(`http://x/api/admin/r?secret=${SECRET}&to=a@b.com`, undefined, method));
    expect(res.status).toBe(401);
    expect(supabaseTouched).not.toHaveBeenCalled();
  });

  it.each([
    ['register-templates', registerTemplates],
    ['test-email', testEmail],
  ] as const)('%s sem CRON_SECRET → 401', async (_n, handler) => {
    delete process.env.CRON_SECRET;
    const res = await handler(req('http://x/api/admin/r?to=a@b.com', 'Bearer undefined', _n === 'test-email' ? 'POST' : 'GET'));
    expect(res.status).toBe(401);
  });
});
