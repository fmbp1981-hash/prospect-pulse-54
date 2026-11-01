#!/usr/bin/env node
/**
 * migrate-connections.ts — migração assistida de user_settings para
 * organization_connections (Sprint 2b, corte dos conectores).
 *
 * Para cada organização, lê o user_settings do usuário responsável (admin
 * mais antigo; sem admin, membro mais antigo — mesma regra do resolvedor) e
 * cria as conexões com status `pending_test`:
 *   - whatsapp: provider `meta` → meta_cloud; `evolution` → evolution (URL
 *     normalizada para a base). Só é criada se TODOS os campos exigidos
 *     existirem; meta_cloud exige `appSecret`, que não existe no legado, então
 *     sai como "entrada manual" (nenhum valor é inventado).
 *   - email (resend), llm (openai), prospecting (apify, firecrawl): chave
 *     preenchida → `own` (segredo cifrado); vazia → `platform`. E-mail precisa
 *     de from_email (domínio do cliente); sem ele → entrada manual.
 *   - prospecting (google_places): sempre `platform` (não há chave no legado).
 * Idempotente: nunca sobrescreve conexão existente (whatsapp/email/llm: uma
 * por categoria; prospecting: uma por provedor). Usuários sem organização são
 * ignorados e listados. A saída nunca contém segredos, só ids, provedores e
 * nomes de campos.
 *
 * Uso:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   CONNECTORS_MASTER_KEY_V1=... CONNECTORS_ACTIVE_KEY_VERSION=v1 \
 *   npx tsx scripts/migrate-connections.ts [--dry-run | --apply]
 *
 * --dry-run (padrão): só mostra o plano; nada é escrito.
 * --apply: grava. Em produção, somente com autorização explícita do usuário
 * (ver docs/runbooks/corte-conectores.md).
 */
import { createClient } from '@supabase/supabase-js';
import { encryptJson } from '../src/lib/connectors/crypto/secret-box';
import { providerConfigSchemas, providerSecretSchemas } from '../src/lib/connectors/schemas';
import type { ConnectorCategory, CredentialSource, ProviderId } from '../src/lib/connectors/types';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Colunas legadas de user_settings lidas pela migração. */
export interface LegacySettings {
  user_id: string;
  company_name: string | null;
  provider: string | null;
  evolution_api_url: string | null;
  evolution_api_key: string | null;
  evolution_instance_name: string | null;
  business_phone_number_id: string | null;
  business_access_token: string | null;
  meta_verify_token: string | null;
  openai_api_key: string | null;
  resend_api_key: string | null;
  from_email: string | null;
  apify_api_key: string | null;
  firecrawl_api_key: string | null;
}

export const LEGACY_COLUMNS =
  'user_id, company_name, provider, evolution_api_url, evolution_api_key, evolution_instance_name, ' +
  'business_phone_number_id, business_access_token, meta_verify_token, openai_api_key, resend_api_key, ' +
  'from_email, apify_api_key, firecrawl_api_key';

export interface NewConnectionRow {
  organization_id: string;
  category: ConnectorCategory;
  provider: ProviderId;
  credential_source: CredentialSource;
  config: JsonValue;
  /** EncryptedSecret (own) ou null (platform). */
  secret: JsonValue | null;
  status: 'pending_test' | 'active' | 'failing' | 'disabled';
}

export interface MigrationStore {
  listOrganizations(): Promise<Array<{ id: string; name: string }>>;
  /** Admin mais antigo; sem admin, membro mais antigo; sem membros, null. */
  findResponsibleUserId(organizationId: string): Promise<string | null>;
  getLegacySettings(userId: string): Promise<LegacySettings | null>;
  /** user_ids com user_settings e sem nenhuma linha em organization_members. */
  listUsersWithoutOrganization(): Promise<string[]>;
  listConnectionKeys(organizationId: string): Promise<Array<{ category: string; provider: string }>>;
  insertConnection(row: NewConnectionRow): Promise<void>;
}

export interface ManualEntry {
  organizationId: string;
  category: ConnectorCategory;
  provider: string;
  /** Campos exigidos que não puderam ser preenchidos (ex.: secret.appSecret). */
  missing: string[];
  /** Campos que o legado tinha (só nomes, nunca valores). */
  mappedFields: string[];
}

export interface MigrationSummary {
  apply: boolean;
  organizations: number;
  created: number;
  existing: number;
  manual: ManualEntry[];
  organizationsWithoutMembers: string[];
  usersWithoutOrganization: string[];
}

export interface MigrationOptions {
  apply: boolean;
  log: (line: string) => void;
}

/** Segmentos de rota da Evolution API: tudo a partir deles é removido. */
const EVOLUTION_ROUTE_SEGMENTS = new Set(['chat', 'message', 'instance', 'webhook', 'group', 'settings', 'manager']);

/** Reduz uma URL da Evolution (às vezes salva com o endpoint) à URL base. */
export function normalizeEvolutionBaseUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const segments = url.pathname.split('/').filter(Boolean);
  const cut = segments.findIndex((s) => EVOLUTION_ROUTE_SEGMENTS.has(s));
  const kept = cut === -1 ? segments : segments.slice(0, cut);
  return `${url.protocol}//${url.host}${kept.length ? `/${kept.join('/')}` : ''}`;
}

function clean(value: string | null | undefined): string | undefined {
  const v = (value ?? '').trim();
  return v ? v : undefined;
}

function definedOnly(obj: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

interface Candidate {
  category: ConnectorCategory;
  provider: ProviderId;
  credentialSource: CredentialSource;
  config: Record<string, string | undefined>;
  /** Só para `own`. */
  secret?: Record<string, string | undefined>;
}

type Validated =
  | { ok: true; config: JsonValue; secret?: Record<string, string> }
  | { ok: false; missing: string[]; mappedFields: string[] };

function validate(c: Candidate): Validated {
  const mappedFields = [
    ...Object.entries(c.config).filter(([, v]) => v !== undefined).map(([k]) => `config.${k}`),
    ...Object.entries(c.secret ?? {}).filter(([, v]) => v !== undefined).map(([k]) => `secret.${k}`),
  ];
  const missing: string[] = [];
  const config = providerConfigSchemas[c.provider].safeParse(definedOnly(c.config));
  if (!config.success) {
    for (const issue of config.error.issues) missing.push(`config.${issue.path.join('.')}`);
  }
  let secret: Record<string, string> | undefined;
  if (c.credentialSource === 'own') {
    const parsed = providerSecretSchemas[c.provider].safeParse(definedOnly(c.secret ?? {}));
    if (!parsed.success) {
      for (const issue of parsed.error.issues) missing.push(`secret.${issue.path.join('.')}`);
    } else {
      secret = parsed.data as Record<string, string>;
    }
  }
  if (missing.length || !config.success) {
    return { ok: false, missing: [...new Set(missing)], mappedFields };
  }
  return { ok: true, config: config.data as JsonValue, secret };
}

function whatsappCandidate(s: LegacySettings): Candidate | { unsupported: string } | null {
  const hasEvolution = Boolean(
    clean(s.evolution_api_url) || clean(s.evolution_api_key) || clean(s.evolution_instance_name)
  );
  const hasMeta = Boolean(
    clean(s.business_phone_number_id) || clean(s.business_access_token) || clean(s.meta_verify_token)
  );
  const provider = clean(s.provider)?.toLowerCase();

  let target: 'evolution' | 'meta_cloud' | null = null;
  if (provider === 'meta' || provider === 'meta_cloud') target = 'meta_cloud';
  else if (provider === 'evolution') target = 'evolution';
  else if (provider) return { unsupported: provider };
  else if (hasEvolution) target = 'evolution';
  else if (hasMeta) target = 'meta_cloud';
  if (!target) return null;

  if (target === 'evolution') {
    return {
      category: 'whatsapp',
      provider: 'evolution',
      credentialSource: 'own',
      config: {
        baseUrl: normalizeEvolutionBaseUrl(s.evolution_api_url) ?? undefined,
        instanceName: clean(s.evolution_instance_name),
      },
      secret: { apiKey: clean(s.evolution_api_key) },
    };
  }
  return {
    category: 'whatsapp',
    provider: 'meta_cloud',
    credentialSource: 'own',
    config: { phoneNumberId: clean(s.business_phone_number_id) },
    // appSecret não existe no legado: fica ausente e a conexão vai para entrada manual.
    secret: {
      accessToken: clean(s.business_access_token),
      appSecret: undefined,
      verifyToken: clean(s.meta_verify_token),
    },
  };
}

function keyCandidate(
  category: ConnectorCategory,
  provider: ProviderId,
  secretField: string,
  key: string | undefined,
  config: Record<string, string | undefined> = {}
): Candidate {
  return key
    ? { category, provider, credentialSource: 'own', config, secret: { [secretField]: key } }
    : { category, provider, credentialSource: 'platform', config };
}

function candidatesFor(s: LegacySettings, organizationName: string): Array<Candidate | { unsupported: string }> {
  const out: Array<Candidate | { unsupported: string }> = [];
  const wa = whatsappCandidate(s);
  if (wa) out.push(wa);

  const fromEmail = clean(s.from_email);
  out.push(
    keyCandidate('email', 'resend', 'apiKey', clean(s.resend_api_key), {
      domain: fromEmail?.split('@')[1]?.toLowerCase(),
      fromEmail,
      fromName: clean(s.company_name) ?? clean(organizationName),
    })
  );
  out.push(keyCandidate('llm', 'openai', 'apiKey', clean(s.openai_api_key)));
  // Google Places é o canal principal de prospecção; não há chave no legado
  // (vinha só do env), então usa sempre a credencial da plataforma.
  out.push(keyCandidate('prospecting', 'google_places', 'apiKey', undefined));
  out.push(keyCandidate('prospecting', 'apify', 'apiToken', clean(s.apify_api_key)));
  out.push(keyCandidate('prospecting', 'firecrawl', 'apiKey', clean(s.firecrawl_api_key)));
  return out;
}

function emptyLegacy(userId: string): LegacySettings {
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

/** Categorias com no máximo uma conexão por organização (índice parcial no banco). */
const SINGLE_PER_CATEGORY: readonly ConnectorCategory[] = ['whatsapp', 'email', 'llm'];

export async function runMigration(store: MigrationStore, opts: MigrationOptions): Promise<MigrationSummary> {
  const { apply, log } = opts;
  if (apply) {
    // Falha cedo se a chave mestra estiver ausente/inválida, antes de qualquer escrita.
    await encryptJson({ probe: true });
  }

  const summary: MigrationSummary = {
    apply,
    organizations: 0,
    created: 0,
    existing: 0,
    manual: [],
    organizationsWithoutMembers: [],
    usersWithoutOrganization: [],
  };

  log(`Modo: ${apply ? 'APPLY' : 'DRY-RUN (nada será gravado)'}`);
  const orgs = await store.listOrganizations();
  summary.organizations = orgs.length;

  for (const org of orgs) {
    const userId = await store.findResponsibleUserId(org.id);
    if (!userId) {
      summary.organizationsWithoutMembers.push(org.id);
      log(`\nOrganização ${org.id} (${org.name}): sem membros — ignorada`);
      continue;
    }
    const settings = (await store.getLegacySettings(userId)) ?? emptyLegacy(userId);
    log(`\nOrganização ${org.id} (${org.name}) — user_settings do responsável ${userId}`);

    const existingKeys = await store.listConnectionKeys(org.id);
    for (const cand of candidatesFor(settings, org.name)) {
      if ('unsupported' in cand) {
        const entry: ManualEntry = {
          organizationId: org.id,
          category: 'whatsapp',
          provider: cand.unsupported,
          missing: ['provedor sem suporte (configure evolution ou meta_cloud)'],
          mappedFields: [],
        };
        summary.manual.push(entry);
        log(`  [manual] whatsapp/${cand.unsupported}: provedor legado sem suporte`);
        continue;
      }

      const label = `${cand.category}/${cand.provider}`;
      const exists = existingKeys.some((k) =>
        SINGLE_PER_CATEGORY.includes(cand.category)
          ? k.category === cand.category
          : k.category === cand.category && k.provider === cand.provider
      );
      if (exists) {
        summary.existing++;
        log(`  [existe] ${label}: conexão já existe — não alterada`);
        continue;
      }

      const result = validate(cand);
      if (!result.ok) {
        summary.manual.push({
          organizationId: org.id,
          category: cand.category,
          provider: cand.provider,
          missing: result.missing,
          mappedFields: result.mappedFields,
        });
        log(
          `  [manual] ${label}: faltando ${result.missing.join(', ')}` +
            (result.mappedFields.length ? ` (legado tem: ${result.mappedFields.join(', ')})` : '')
        );
        continue;
      }

      if (apply) {
        const secret = result.secret ? ((await encryptJson(result.secret)) as unknown as JsonValue) : null;
        await store.insertConnection({
          organization_id: org.id,
          category: cand.category,
          provider: cand.provider,
          credential_source: cand.credentialSource,
          config: result.config,
          secret,
          status: 'pending_test',
        });
        existingKeys.push({ category: cand.category, provider: cand.provider });
      }
      summary.created++;
      log(`  [${apply ? 'criada' : 'criar'}] ${label} (${cand.credentialSource}, pending_test)`);
    }
  }

  summary.usersWithoutOrganization = await store.listUsersWithoutOrganization();
  if (summary.usersWithoutOrganization.length) {
    log(`\nUsuários com user_settings e sem organização (ignorados): ${summary.usersWithoutOrganization.length}`);
    for (const id of summary.usersWithoutOrganization) log(`  - ${id}`);
  }

  log(
    `\nResumo: organizações=${summary.organizations} ${apply ? 'criadas' : 'a criar'}=${summary.created} ` +
      `existentes=${summary.existing} entrada_manual=${summary.manual.length} ` +
      `orgs_sem_membros=${summary.organizationsWithoutMembers.length} ` +
      `usuarios_sem_org=${summary.usersWithoutOrganization.length}`
  );
  return summary;
}

/** Store real: service role (server-only), só leitura + insert de conexões. */
function createSupabaseStore(url: string, serviceKey: string): MigrationStore {
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  return {
    async listOrganizations() {
      const { data, error } = await db.from('organizations').select('id, name').order('name');
      if (error) throw new Error(`organizations: ${error.message}`);
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
    async findResponsibleUserId(organizationId) {
      const { data, error } = await db
        .from('organization_members')
        .select('user_id, role')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true });
      if (error) throw new Error(`organization_members: ${error.message}`);
      const members = (data ?? []) as Array<{ user_id: string; role: string }>;
      return (members.find((m) => m.role === 'admin') ?? members[0])?.user_id ?? null;
    },
    async getLegacySettings(userId) {
      const { data, error } = await db
        .from('user_settings')
        .select(LEGACY_COLUMNS)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error(`user_settings: ${error.message}`);
      return (data as unknown as LegacySettings | null) ?? null;
    },
    async listUsersWithoutOrganization() {
      const [settings, members] = await Promise.all([
        db.from('user_settings').select('user_id'),
        db.from('organization_members').select('user_id'),
      ]);
      if (settings.error) throw new Error(`user_settings: ${settings.error.message}`);
      if (members.error) throw new Error(`organization_members: ${members.error.message}`);
      const withOrg = new Set(((members.data ?? []) as Array<{ user_id: string }>).map((m) => m.user_id));
      return ((settings.data ?? []) as Array<{ user_id: string }>)
        .map((s) => s.user_id)
        .filter((id) => !withOrg.has(id));
    },
    async listConnectionKeys(organizationId) {
      const { data, error } = await db
        .from('organization_connections')
        .select('category, provider')
        .eq('organization_id', organizationId);
      if (error) throw new Error(`organization_connections: ${error.message}`);
      return (data ?? []) as Array<{ category: string; provider: string }>;
    },
    async insertConnection(row) {
      // Insert puro: conflito vira erro e nada é sobrescrito.
      const { error } = await db.from('organization_connections').insert(row);
      if (error) throw new Error(`organization_connections ${row.organization_id} ${row.category}/${row.provider}: ${error.message}`);
    },
  };
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
  await runMigration(createSupabaseStore(url, serviceKey), { apply, log: (line) => console.log(line) });
}

if (/migrate-connections\.ts$/.test(process.argv[1] ?? '')) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
