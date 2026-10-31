import { beforeAll, describe, expect, it } from 'vitest';
import {
  normalizeEvolutionBaseUrl,
  runMigration,
  type LegacySettings,
  type MigrationStore,
  type NewConnectionRow,
} from '../../scripts/migrate-connections';
import { decryptJson, type EncryptedSecret } from '@/lib/connectors/crypto/secret-box';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const ADMIN_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const OPER_A = 'aaaaaaaa-0000-4000-8000-000000000002';
const ADMIN_B = 'bbbbbbbb-0000-4000-8000-000000000001';
const ORPHAN = 'cccccccc-0000-4000-8000-000000000001';

// Valores fictícios usados para provar que nunca aparecem na saída.
const FAKE = {
  evolutionKey: 'fake-evolution-key-123456',
  openaiKey: 'fake-llm-key-abcdef',
  metaToken: 'fake-meta-access-token-xyz',
  metaVerify: 'fake-verify-token-789',
  resendKey: 'fake-email-key-000',
  apifyKey: 'fake-apify-token-111',
  operatorKey: 'fake-operator-key-not-used',
};

function emptySettings(userId: string): LegacySettings {
  return {
    user_id: userId,
    company_name: null,
    provider: null,
    evolution_api_url: null,
    evolution_api_key: null,
    evolution_instance_name: null,
    business_phone_number_id: null,
    business_access_token: null,
    meta_verify_token: null,
    openai_api_key: null,
    resend_api_key: null,
    from_email: null,
    apify_api_key: null,
    firecrawl_api_key: null,
  };
}

interface FakeData {
  orgs: Array<{ id: string; name: string }>;
  members: Record<string, Array<{ user_id: string; role: string }>>;
  settings: Record<string, LegacySettings>;
  orphans: string[];
}

function makeStore(data: FakeData) {
  const inserted: NewConnectionRow[] = [];
  const store: MigrationStore = {
    async listOrganizations() {
      return data.orgs;
    },
    async findResponsibleUserId(orgId) {
      const members = data.members[orgId] ?? [];
      return (members.find((m) => m.role === 'admin') ?? members[0])?.user_id ?? null;
    },
    async getLegacySettings(userId) {
      return data.settings[userId] ?? null;
    },
    async listUsersWithoutOrganization() {
      return data.orphans;
    },
    async listConnectionKeys(orgId) {
      return inserted
        .filter((r) => r.organization_id === orgId)
        .map((r) => ({ category: r.category, provider: r.provider }));
    },
    async insertConnection(row) {
      inserted.push(row);
    },
  };
  return { store, inserted };
}

function baseData(): FakeData {
  return {
    orgs: [
      { id: ORG_A, name: 'Org A' },
      { id: ORG_B, name: 'Org B' },
    ],
    members: {
      [ORG_A]: [
        { user_id: OPER_A, role: 'operador' },
        { user_id: ADMIN_A, role: 'admin' },
      ],
      [ORG_B]: [{ user_id: ADMIN_B, role: 'admin' }],
    },
    settings: {
      [ADMIN_A]: {
        ...emptySettings(ADMIN_A),
        company_name: 'Empresa A',
        provider: 'evolution',
        evolution_api_url: 'https://evo.exemplo.com.br/chat/whatsappNumbers/inst-a',
        evolution_api_key: FAKE.evolutionKey,
        evolution_instance_name: 'inst-a',
        openai_api_key: FAKE.openaiKey,
        apify_api_key: FAKE.apifyKey,
      },
      [OPER_A]: { ...emptySettings(OPER_A), openai_api_key: FAKE.operatorKey },
      [ADMIN_B]: {
        ...emptySettings(ADMIN_B),
        company_name: 'Empresa B',
        provider: 'meta',
        business_phone_number_id: '1234567890',
        business_access_token: FAKE.metaToken,
        meta_verify_token: FAKE.metaVerify,
        resend_api_key: FAKE.resendKey,
        from_email: 'contato@empresab.com.br',
      },
    },
    orphans: [ORPHAN],
  };
}

function collectLog() {
  const lines: string[] = [];
  return { lines, log: (line: string) => lines.push(line) };
}

const silent = () => {};

beforeAll(() => {
  process.env.CONNECTORS_MASTER_KEY_V1 = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
  process.env.CONNECTORS_ACTIVE_KEY_VERSION = 'v1';
});

describe('normalizeEvolutionBaseUrl', () => {
  it('reduz /chat/whatsappNumbers/... para a base', () => {
    expect(normalizeEvolutionBaseUrl('https://evo.exemplo.com.br/chat/whatsappNumbers/inst-a')).toBe(
      'https://evo.exemplo.com.br'
    );
  });

  it('mantém prefixo de caminho antes do endpoint e remove barra final', () => {
    expect(normalizeEvolutionBaseUrl('https://x.com/evolution/message/sendText/inst/')).toBe(
      'https://x.com/evolution'
    );
    expect(normalizeEvolutionBaseUrl('https://x.com/')).toBe('https://x.com');
  });

  it('URL inválida devolve null', () => {
    expect(normalizeEvolutionBaseUrl('não é url')).toBeNull();
    expect(normalizeEvolutionBaseUrl('')).toBeNull();
  });
});

describe('runMigration', () => {
  it('dry-run não escreve', async () => {
    const { store, inserted } = makeStore(baseData());
    const summary = await runMigration(store, { apply: false, log: silent });
    expect(inserted).toHaveLength(0);
    expect(summary.created).toBeGreaterThan(0);
  });

  it('evolution normaliza a URL para a base, usa o admin da org e cifra o segredo', async () => {
    const { store, inserted } = makeStore(baseData());
    await runMigration(store, { apply: true, log: silent });

    const evo = inserted.find((r) => r.organization_id === ORG_A && r.provider === 'evolution');
    expect(evo).toBeDefined();
    expect(evo!.category).toBe('whatsapp');
    expect(evo!.credential_source).toBe('own');
    expect(evo!.status).toBe('pending_test');
    expect(evo!.config).toEqual({ baseUrl: 'https://evo.exemplo.com.br', instanceName: 'inst-a' });
    expect(JSON.stringify(evo!.secret)).not.toContain(FAKE.evolutionKey);
    expect(await decryptJson(evo!.secret as unknown as EncryptedSecret)).toEqual({
      apiKey: FAKE.evolutionKey,
    });

    // user_settings do admin da org, não do operador (membro mais antigo)
    const llm = inserted.find((r) => r.organization_id === ORG_A && r.provider === 'openai');
    expect(llm!.credential_source).toBe('own');
    expect(await decryptJson(llm!.secret as unknown as EncryptedSecret)).toEqual({
      apiKey: FAKE.openaiKey,
    });

    const apify = inserted.find((r) => r.organization_id === ORG_A && r.provider === 'apify');
    expect(await decryptJson(apify!.secret as unknown as EncryptedSecret)).toEqual({
      apiToken: FAKE.apifyKey,
    });
  });

  it('meta mapeia os campos legados, mas sem appSecret não cria a conexão (entrada manual)', async () => {
    const { store, inserted } = makeStore(baseData());
    const summary = await runMigration(store, { apply: true, log: silent });

    expect(inserted.find((r) => r.organization_id === ORG_B && r.category === 'whatsapp')).toBeUndefined();
    const manual = summary.manual.find((m) => m.organizationId === ORG_B && m.provider === 'meta_cloud');
    expect(manual).toBeDefined();
    expect(manual!.missing).toEqual(['secret.appSecret']);
    expect(manual!.mappedFields).toEqual(
      expect.arrayContaining(['config.phoneNumberId', 'secret.accessToken', 'secret.verifyToken'])
    );
  });

  it('resend com chave própria usa from_email/company_name e cifra o segredo', async () => {
    const { store, inserted } = makeStore(baseData());
    await runMigration(store, { apply: true, log: silent });
    const email = inserted.find((r) => r.organization_id === ORG_B && r.provider === 'resend');
    expect(email!.credential_source).toBe('own');
    expect(email!.config).toEqual({
      domain: 'empresab.com.br',
      fromEmail: 'contato@empresab.com.br',
      fromName: 'Empresa B',
    });
    expect(await decryptJson(email!.secret as unknown as EncryptedSecret)).toEqual({
      apiKey: FAKE.resendKey,
    });
  });

  it('chave vazia vira platform, sem segredo', async () => {
    const { store, inserted } = makeStore(baseData());
    await runMigration(store, { apply: true, log: silent });

    const llmB = inserted.find((r) => r.organization_id === ORG_B && r.provider === 'openai');
    expect(llmB!.credential_source).toBe('platform');
    expect(llmB!.secret).toBeNull();
    const fireA = inserted.find((r) => r.organization_id === ORG_A && r.provider === 'firecrawl');
    expect(fireA!.credential_source).toBe('platform');
    expect(fireA!.category).toBe('prospecting');
    expect(fireA!.status).toBe('pending_test');
  });

  it('e-mail sem from_email fica para entrada manual', async () => {
    const { store, inserted } = makeStore(baseData());
    const summary = await runMigration(store, { apply: true, log: silent });
    expect(inserted.find((r) => r.organization_id === ORG_A && r.provider === 'resend')).toBeUndefined();
    const manual = summary.manual.find((m) => m.organizationId === ORG_A && m.provider === 'resend');
    expect(manual!.missing).toContain('config.fromEmail');
  });

  it('evolution com URL insegura fica para entrada manual', async () => {
    const data = baseData();
    data.settings[ADMIN_A].evolution_api_url = 'http://10.0.0.5/chat/whatsappNumbers/x';
    const { store, inserted } = makeStore(data);
    const summary = await runMigration(store, { apply: true, log: silent });
    expect(inserted.find((r) => r.provider === 'evolution')).toBeUndefined();
    expect(summary.manual.find((m) => m.provider === 'evolution')!.missing).toContain('config.baseUrl');
  });

  it('segunda execução não duplica nem sobrescreve', async () => {
    const { store, inserted } = makeStore(baseData());
    await runMigration(store, { apply: true, log: silent });
    const count = inserted.length;
    const second = await runMigration(store, { apply: true, log: silent });
    expect(inserted).toHaveLength(count);
    expect(second.created).toBe(0);
    expect(second.existing).toBe(count);
  });

  it('não cria segunda conexão de whatsapp se a org já tem outro provedor', async () => {
    const { store, inserted } = makeStore(baseData());
    inserted.push({
      organization_id: ORG_A,
      category: 'whatsapp',
      provider: 'meta_cloud',
      credential_source: 'own',
      config: {},
      secret: null,
      status: 'active',
    });
    await runMigration(store, { apply: true, log: silent });
    expect(inserted.filter((r) => r.organization_id === ORG_A && r.category === 'whatsapp')).toHaveLength(1);
  });

  it('usuários sem organização são ignorados e listados', async () => {
    const { store } = makeStore(baseData());
    const { lines, log } = collectLog();
    const summary = await runMigration(store, { apply: false, log });
    expect(summary.usersWithoutOrganization).toEqual([ORPHAN]);
    expect(lines.join('\n')).toContain(ORPHAN);
  });

  it('saída não contém segredo', async () => {
    const { store } = makeStore(baseData());
    const { lines, log } = collectLog();
    const summary = await runMigration(store, { apply: true, log });
    const output = lines.join('\n') + JSON.stringify(summary);
    for (const value of Object.values(FAKE)) {
      expect(output).not.toContain(value);
    }
  });
});
