/**
 * Resolvedor de conexões por organização.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, filterValue, type FakeCall, type FakeResult } from './helpers/fake-supabase';

const state = vi.hoisted(() => ({
  fake: null as unknown,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => (state.fake as { client: unknown }).client),
}));

import { encryptJson } from '@/lib/connectors/crypto/secret-box';
import { resolveConnection, resolveConnectionByWebhookKey } from '@/lib/connectors/resolve-connection';
import { ConnectionNotConfiguredError } from '@/lib/connectors/types';

const ORG = '11111111-1111-1111-1111-111111111111';
const OTHER_ORG = '22222222-2222-2222-2222-222222222222';

function keyB64(fill: number): string {
  return btoa(String.fromCharCode(...new Uint8Array(32).fill(fill)));
}

type Rows = Record<string, Record<string, unknown> | null>;

function setup(rows: Rows) {
  const fake = createFakeSupabase((call: FakeCall): FakeResult => {
    return { data: rows[call.table] ?? null, error: null };
  });
  state.fake = fake;
  return fake;
}

async function connRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conn-1',
    organization_id: ORG,
    category: 'email',
    provider: 'resend',
    credential_source: 'own',
    config: { domain: 'exemplo.com', fromEmail: 'oi@exemplo.com', fromName: 'Exemplo' },
    secret: await encryptJson({ apiKey: 're_own' }),
    status: 'active',
    webhook_key: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  process.env.CONNECTORS_MASTER_KEY_V1 = keyB64(7);
  process.env.CONNECTORS_ACTIVE_KEY_VERSION = 'v1';
});

describe('resolveConnection', () => {
  it('sem linha lança ConnectionNotConfiguredError', async () => {
    setup({ organization_connections: null });
    await expect(resolveConnection(ORG, 'email')).rejects.toBeInstanceOf(ConnectionNotConfiguredError);
  });

  it.each(['failing', 'disabled', 'pending_test'])(
    'status %s não é resolvido (a consulta filtra status=active)',
    async (status) => {
      // O banco só devolve linhas que casam com o filtro; o fake simula isso.
      const row = await connRow({ status });
      const fake = createFakeSupabase((call) => {
        const wanted = filterValue(call, 'status');
        return { data: wanted === row.status ? row : null, error: null };
      });
      state.fake = fake;
      await expect(resolveConnection(ORG, 'email')).rejects.toBeInstanceOf(ConnectionNotConfiguredError);
      expect(filterValue(fake.calls[0], 'status')).toBe('active');
    }
  );

  it('own decifra o segredo da conexão', async () => {
    setup({ organization_connections: await connRow() });
    const conn = await resolveConnection(ORG, 'email', 'resend');
    expect(conn.secret).toEqual({ apiKey: 're_own' });
    expect(conn.credentialSource).toBe('own');
    expect(conn.organizationId).toBe(ORG);
    expect(conn.config.fromEmail).toBe('oi@exemplo.com');
  });

  it('platform usa platform_credentials do provedor', async () => {
    const fake = setup({
      organization_connections: await connRow({ credential_source: 'platform', secret: null }),
      platform_credentials: { provider: 'resend', secret: await encryptJson({ apiKey: 're_platform' }) },
    });
    const conn = await resolveConnection(ORG, 'email');
    expect(conn.secret).toEqual({ apiKey: 're_platform' });
    expect(conn.credentialSource).toBe('platform');
    const platformCall = fake.calls.find((c) => c.table === 'platform_credentials');
    expect(filterValue(platformCall!, 'provider')).toBe('resend');
  });

  it('platform sem credencial da plataforma lança ConnectionNotConfiguredError', async () => {
    setup({
      organization_connections: await connRow({ credential_source: 'platform', secret: null }),
      platform_credentials: null,
    });
    await expect(resolveConnection(ORG, 'email')).rejects.toBeInstanceOf(ConnectionNotConfiguredError);
  });

  it('consulta sempre filtra organization_id, categoria e provedor', async () => {
    const fake = setup({ organization_connections: await connRow() });
    await resolveConnection(ORG, 'email', 'resend');
    const call = fake.calls[0];
    expect(call.table).toBe('organization_connections');
    expect(filterValue(call, 'organization_id')).toBe(ORG);
    expect(filterValue(call, 'organization_id')).not.toBe(OTHER_ORG);
    expect(filterValue(call, 'category')).toBe('email');
    expect(filterValue(call, 'provider')).toBe('resend');
  });

  it('config inválida para o provedor lança erro de validação', async () => {
    setup({
      organization_connections: await connRow({
        config: { domain: 'exemplo.com', fromEmail: 'oi@outro.com', fromName: 'X' },
      }),
    });
    await expect(resolveConnection(ORG, 'email')).rejects.toMatchObject({ name: 'ZodError' });
  });

  it('segredo com formato inválido lança erro de validação', async () => {
    setup({ organization_connections: await connRow({ secret: await encryptJson({ foo: 'bar' }) }) });
    await expect(resolveConnection(ORG, 'email')).rejects.toMatchObject({ name: 'ZodError' });
  });

  it('evolution com baseUrl insegura é rejeitada', async () => {
    setup({
      organization_connections: await connRow({
        category: 'whatsapp',
        provider: 'evolution',
        config: { baseUrl: 'http://localhost:8080', instanceName: 'inst' },
        secret: await encryptJson({ apiKey: 'k' }),
      }),
    });
    await expect(resolveConnection(ORG, 'whatsapp')).rejects.toMatchObject({ name: 'ZodError' });
  });
});

describe('resolveConnection — prospecting', () => {
  it('sem provedor lança erro claro e nem consulta o banco', async () => {
    const fake = setup({ organization_connections: null });
    // @ts-expect-error provider é obrigatório para prospecting (checagem de tipo)
    await expect(resolveConnection(ORG, 'prospecting')).rejects.toThrow(/provider é obrigatório/);
    expect(fake.calls).toHaveLength(0);
  });

  it('com provedor filtra por provider', async () => {
    const fake = setup({
      organization_connections: await connRow({
        category: 'prospecting',
        provider: 'apify',
        config: {},
        secret: await encryptJson({ apiToken: 't' }),
      }),
    });
    const conn = await resolveConnection(ORG, 'prospecting', 'apify');
    expect(conn.secret).toEqual({ apiToken: 't' });
    expect(filterValue(fake.calls[0], 'provider')).toBe('apify');
  });

  it('múltiplas linhas ativas viram erro explícito', async () => {
    state.fake = createFakeSupabase(() => ({
      data: null,
      error: { message: 'multiple rows', code: 'PGRST116' },
    }));
    await expect(resolveConnection(ORG, 'whatsapp')).rejects.toThrow(/mais de uma conexão ativa/);
  });
});

describe('resolveConnectionByWebhookKey', () => {
  it('resolve conexão de WhatsApp e não filtra por status active, mas exclui disabled', async () => {
    const fake = setup({
      organization_connections: await connRow({
        category: 'whatsapp',
        provider: 'meta_cloud',
        config: { phoneNumberId: '123' },
        secret: await encryptJson({ accessToken: 'a', appSecret: 'b', verifyToken: 'c' }),
        status: 'pending_test',
        webhook_key: 'a'.repeat(64),
      }),
    });
    const conn = await resolveConnectionByWebhookKey('a'.repeat(64));
    expect(conn?.provider).toBe('meta_cloud');
    expect(conn?.config).toMatchObject({ phoneNumberId: '123', apiVersion: 'v20.0' });
    expect(filterValue(fake.calls[0], 'webhook_key')).toBe('a'.repeat(64));
    expect(filterValue(fake.calls[0], 'status', 'neq')).toBe('disabled');
  });

  it('chave desconhecida devolve null', async () => {
    setup({ organization_connections: null });
    expect(await resolveConnectionByWebhookKey('f'.repeat(64))).toBeNull();
  });
});
