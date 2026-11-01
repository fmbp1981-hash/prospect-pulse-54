/**
 * Rota legada /api/webhooks/evolution/<token> durante a janela de corte.
 *
 * Depois do script de migração as conexões ficam `pending_test`. A rota legada
 * deve resolver a conexão de WhatsApp da organização com a MESMA regra da rota
 * por chave (status ≠ disabled), para não descartar mensagens recebidas.
 * Aqui o resolvedor e o repositório são reais (Supabase falso, segredo cifrado).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, type FakeCall, type FakeResult } from './helpers/fake-supabase';

const pending: Promise<unknown>[] = [];
vi.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => {
    pending.push(p);
  },
}));

const mocks = vi.hoisted(() => ({
  resolveTenantByWebhookToken: vi.fn(),
  resolveOrganizationIdForUser: vi.fn(),
  processInboundWhatsAppEvent: vi.fn(async () => undefined),
}));
vi.mock('@/lib/services/tenant-resolver.service', () => ({
  resolveTenantByWebhookToken: mocks.resolveTenantByWebhookToken,
}));
vi.mock('@/lib/connectors/org-context', () => ({
  resolveOrganizationIdForUser: mocks.resolveOrganizationIdForUser,
}));
vi.mock('@/lib/webhooks/whatsapp-inbound.handler', () => ({
  processInboundWhatsAppEvent: mocks.processInboundWhatsAppEvent,
}));

type Row = Record<string, unknown>;
let rows: Row[] = [];

function matches(row: Row, call: FakeCall): boolean {
  return call.filters.every((f) =>
    f.kind === 'eq' ? row[f.column] === f.value : f.kind === 'neq' ? row[f.column] !== f.value : true
  );
}

function handler(call: FakeCall): FakeResult | undefined {
  if (call.table === 'organization_connections' && call.op === 'select') {
    const found = rows.filter((r) => matches(r, call));
    return { data: found[0] ?? null, error: null };
  }
  return undefined;
}

const fake = createFakeSupabase(handler);
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));

import { encryptJson } from '@/lib/connectors/crypto/secret-box';
import { POST as tokenPost } from '../../app/api/webhooks/evolution/[token]/route';

const TOKEN = 'a'.repeat(32) + '0123456789abcdef0123456789abcdef';
const USER = '00000000-0000-0000-0000-00000000000a';
const ORG = '0a0a0a0a-0000-4000-8000-00000000000a';

async function evolutionRow(status: string): Promise<Row> {
  return {
    id: 'conn-evo',
    organization_id: ORG,
    category: 'whatsapp',
    provider: 'evolution',
    credential_source: 'own',
    config: { baseUrl: 'https://evo.exemplo.com.br', instanceName: 'inst-a' },
    secret: await encryptJson({ apiKey: 'evo-key-a' }),
    status,
  };
}

function post() {
  return tokenPost(
    new NextRequest(`http://x/api/webhooks/evolution/${TOKEN}`, {
      method: 'POST',
      body: JSON.stringify({
        event: 'messages.upsert',
        instance: 'inst-a',
        data: {
          key: { remoteJid: '5511999990000@s.whatsapp.net', fromMe: false, id: 'msg-1' },
          pushName: 'Fulano',
          message: { conversation: 'oi' },
        },
      }),
      headers: { 'content-type': 'application/json', apikey: 'evo-key-a' },
    }),
    { params: { token: TOKEN } }
  );
}

let logSpies: Array<ReturnType<typeof vi.spyOn>> = [];
beforeEach(() => {
  pending.length = 0;
  fake.calls.length = 0;
  rows = [];
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-teste';
  process.env.CONNECTORS_MASTER_KEY_V1 = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
  process.env.CONNECTORS_ACTIVE_KEY_VERSION = 'v1';
  mocks.resolveTenantByWebhookToken.mockResolvedValue({ userId: USER, companyName: 'Org', agentEnabled: true });
  mocks.resolveOrganizationIdForUser.mockResolvedValue(ORG);
  logSpies = [
    vi.spyOn(console, 'warn').mockImplementation(() => undefined),
    vi.spyOn(console, 'error').mockImplementation(() => undefined),
  ];
});
afterEach(() => {
  for (const s of logSpies) s.mockRestore();
});

describe('rota legada na janela de corte (status da conexão)', () => {
  it('conexão pending_test (recém-migrada) → 200 e o evento é processado', async () => {
    rows = [await evolutionRow('pending_test')];
    const res = await post();
    expect(res.status).toBe(200);
    await Promise.all(pending);
    expect(mocks.processInboundWhatsAppEvent).toHaveBeenCalledTimes(1);
    expect(mocks.processInboundWhatsAppEvent).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, connectionId: 'conn-evo' })
    );
    const query = fake.calls.find((c) => c.table === 'organization_connections');
    expect(query?.filters).toEqual(
      expect.arrayContaining([
        { kind: 'eq', column: 'organization_id', value: ORG },
        { kind: 'eq', column: 'category', value: 'whatsapp' },
        { kind: 'neq', column: 'status', value: 'disabled' },
      ])
    );
  });

  it('conexão failing também recebe (mesma regra da rota por chave)', async () => {
    rows = [await evolutionRow('failing')];
    expect((await post()).status).toBe(200);
    await Promise.all(pending);
    expect(mocks.processInboundWhatsAppEvent).toHaveBeenCalledTimes(1);
  });

  it('conexão disabled → 200 sem processar (whatsapp_not_configured)', async () => {
    rows = [await evolutionRow('disabled')];
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { received: 0, ignored: 'whatsapp_not_configured' }, meta: {} });
    expect(pending).toHaveLength(0);
    expect(mocks.processInboundWhatsAppEvent).not.toHaveBeenCalled();
  });
});
