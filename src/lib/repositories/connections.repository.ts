/**
 * connectionsRepository — acesso a organization_connections, platform_credentials
 * e organization_members via service role (server-only).
 *
 * Os métodos que devolvem `secret`/`webhook_key` (findActive, findByWebhookKey,
 * getPlatformCredential) são para uso interno do resolvedor. Qualquer coisa
 * exposta ao cliente deve vir de listForOrganization, que nunca os seleciona.
 */
import { createClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import type {
  ConnectionStatus,
  ConnectorCategory,
  CredentialSource,
  ProviderId,
} from '@/lib/connectors/types';

export type ConnectionRow = Database['public']['Tables']['organization_connections']['Row'];
export type PlatformCredentialRow = Database['public']['Tables']['platform_credentials']['Row'];

/** Linha segura para exibição: sem secret e sem webhook_key. */
export type ConnectionSummary = Omit<ConnectionRow, 'secret' | 'webhook_key'>;

const SUMMARY_COLUMNS =
  'id, organization_id, category, provider, credential_source, config, status, last_tested_at, last_test_result, last_test_ok, configured_by, created_at, updated_at';

export interface UpsertConnectionInput {
  organizationId: string;
  category: ConnectorCategory;
  provider: ProviderId;
  credentialSource: CredentialSource;
  config: Json;
  /**
   * Segredo já cifrado (EncryptedSecret). `undefined` = não altera o segredo
   * gravado (edição só de config); `null` = limpa o segredo.
   */
  secret?: Json | null;
  status?: ConnectionStatus;
  configuredBy?: string | null;
}

export interface UsageEventInsert {
  organizationId: string;
  category: ConnectorCategory;
  provider: ProviderId;
  operation: string;
  quantity: number;
  unit: string;
  connectionId?: string;
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient<Database>(url, key);
}

export const connectionsRepository = {
  /** Conexão ativa da organização (sempre filtrada por organization_id e status). */
  async findActive(
    organizationId: string,
    category: ConnectorCategory,
    provider?: ProviderId
  ): Promise<ConnectionRow | null> {
    let query = getServiceClient()
      .from('organization_connections')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('category', category)
      .eq('status', 'active');
    if (provider) query = query.eq('provider', provider);
    const { data, error } = await query.maybeSingle();
    if (error) {
      // PGRST116: mais de uma linha para maybeSingle (ex.: prospecting sem provedor).
      if (error.code === 'PGRST116') {
        throw new Error('findActive: mais de uma conexão ativa; informe o provedor');
      }
      throw new Error(`findActive error: ${error.message}`);
    }
    return data ?? null;
  },

  /** Conexão pela chave opaca do webhook, qualquer status exceto disabled. */
  async findByWebhookKey(webhookKey: string): Promise<ConnectionRow | null> {
    const { data, error } = await getServiceClient()
      .from('organization_connections')
      .select('*')
      .eq('webhook_key', webhookKey)
      .neq('status', 'disabled')
      .maybeSingle();
    if (error) throw new Error(`findByWebhookKey error: ${error.message}`);
    return data ?? null;
  },

  /** Lista as conexões da organização SEM secret e webhook_key. */
  async listForOrganization(organizationId: string): Promise<ConnectionSummary[]> {
    const { data, error } = await getServiceClient()
      .from('organization_connections')
      .select(SUMMARY_COLUMNS)
      .eq('organization_id', organizationId);
    if (error) throw new Error(`listForOrganization error: ${error.message}`);
    return (data ?? []) as unknown as ConnectionSummary[];
  },

  /** Cria ou atualiza a conexão (organização, categoria, provedor). Devolve a versão segura. */
  async upsert(input: UpsertConnectionInput): Promise<ConnectionSummary> {
    const { data, error } = await getServiceClient()
      .from('organization_connections')
      .upsert(
        {
          organization_id: input.organizationId,
          category: input.category,
          provider: input.provider,
          credential_source: input.credentialSource,
          config: input.config,
          // Sem segredo novo, a coluna fica fora do upsert e o atual é preservado.
          ...(input.secret !== undefined ? { secret: input.secret } : {}),
          status: input.status ?? 'pending_test',
          // Salvar invalida o teste anterior: ativar exige um novo teste aprovado.
          last_test_ok: false,
          configured_by: input.configuredBy ?? null,
        },
        { onConflict: 'organization_id,category,provider' }
      )
      .select(SUMMARY_COLUMNS)
      .single();
    if (error) throw new Error(`upsert error: ${error.message}`);
    return data as unknown as ConnectionSummary;
  },

  /** Grava o resultado de um teste de conexão (status, mensagem, aprovado e quando). */
  async setStatus(
    id: string,
    status: ConnectionStatus,
    result: string | null,
    lastTestOk: boolean
  ): Promise<void> {
    const { error } = await getServiceClient()
      .from('organization_connections')
      .update({
        status,
        last_test_result: result,
        last_test_ok: lastTestOk,
        last_tested_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error(`setStatus error: ${error.message}`);
  },

  /** Linha completa (com secret/webhook_key) — uso interno do serviço de admin. */
  async findByIdForOrganization(organizationId: string, id: string): Promise<ConnectionRow | null> {
    const { data, error } = await getServiceClient()
      .from('organization_connections')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (error) throw new Error(`findByIdForOrganization error: ${error.message}`);
    return data ?? null;
  },

  /** Conexão (qualquer status) por organização, categoria e provedor — uso interno. */
  async findByKey(
    organizationId: string,
    category: ConnectorCategory,
    provider: ProviderId
  ): Promise<ConnectionRow | null> {
    const { data, error } = await getServiceClient()
      .from('organization_connections')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('category', category)
      .eq('provider', provider)
      .maybeSingle();
    if (error) throw new Error(`findByKey error: ${error.message}`);
    return data ?? null;
  },

  /** Linhas completas da organização (com secret/webhook_key) — uso interno do admin. */
  async listRowsForOrganization(organizationId: string): Promise<ConnectionRow[]> {
    const { data, error } = await getServiceClient()
      .from('organization_connections')
      .select('*')
      .eq('organization_id', organizationId);
    if (error) throw new Error(`listRowsForOrganization error: ${error.message}`);
    return data ?? [];
  },

  /**
   * Ativa/desativa manualmente. `active` só se o último teste foi aprovado
   * (filtro last_test_ok = true na própria escrita). Devolve false se nenhuma
   * linha foi alterada.
   */
  async updateStatus(
    organizationId: string,
    id: string,
    status: 'active' | 'disabled'
  ): Promise<boolean> {
    let query = getServiceClient()
      .from('organization_connections')
      .update({ status })
      .eq('id', id)
      .eq('organization_id', organizationId);
    if (status === 'active') query = query.eq('last_test_ok', true);
    const { data, error } = await query.select('id');
    if (error) throw new Error(`updateStatus error: ${error.message}`);
    return (data ?? []).length > 0;
  },

  /** Remove a conexão. Devolve false se não é da organização. */
  async deleteForOrganization(organizationId: string, id: string): Promise<boolean> {
    const { data, error } = await getServiceClient()
      .from('organization_connections')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select('id');
    if (error) throw new Error(`deleteForOrganization error: ${error.message}`);
    return (data ?? []).length > 0;
  },

  async listOrganizations(): Promise<Array<{ id: string; name: string }>> {
    const { data, error } = await getServiceClient()
      .from('organizations')
      .select('id, name')
      .order('name', { ascending: true });
    if (error) throw new Error(`listOrganizations error: ${error.message}`);
    return data ?? [];
  },

  /** Credenciais da plataforma (com secret cifrado) — uso interno do serviço de admin. */
  async listPlatformCredentials(): Promise<PlatformCredentialRow[]> {
    const { data, error } = await getServiceClient().from('platform_credentials').select('*');
    if (error) throw new Error(`listPlatformCredentials error: ${error.message}`);
    return data ?? [];
  },

  async getPlatformCredential(provider: ProviderId): Promise<PlatformCredentialRow | null> {
    const { data, error } = await getServiceClient()
      .from('platform_credentials')
      .select('*')
      .eq('provider', provider)
      .maybeSingle();
    if (error) throw new Error(`getPlatformCredential error: ${error.message}`);
    return data ?? null;
  },

  async upsertPlatformCredential(
    provider: ProviderId,
    secret: Json,
    config: Json,
    userId: string | null
  ): Promise<void> {
    const { error } = await getServiceClient()
      .from('platform_credentials')
      .upsert({ provider, secret, config, updated_by: userId }, { onConflict: 'provider' });
    if (error) throw new Error(`upsertPlatformCredential error: ${error.message}`);
  },

  /** Primeira organização do usuário (por organization_members). */
  async findOrganizationIdForUser(userId: string): Promise<string | null> {
    const { data, error } = await getServiceClient()
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`findOrganizationIdForUser error: ${error.message}`);
    return data?.organization_id ?? null;
  },

  /**
   * Usuário responsável pela organização: o admin mais antigo; sem admin,
   * o membro mais antigo. Só membros da própria organização.
   */
  async findOrganizationResponsibleUserId(organizationId: string): Promise<string | null> {
    const { data, error } = await getServiceClient()
      .from('organization_members')
      .select('user_id, role')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`findOrganizationResponsibleUserId error: ${error.message}`);
    const members = data ?? [];
    return (members.find((m) => m.role === 'admin') ?? members[0])?.user_id ?? null;
  },

  /** Insere um evento de consumo em usage_events (append-only). */
  async insertUsage(e: UsageEventInsert): Promise<void> {
    const { error } = await getServiceClient().from('usage_events').insert({
      organization_id: e.organizationId,
      category: e.category,
      provider: e.provider,
      operation: e.operation,
      quantity: e.quantity,
      unit: e.unit,
      connection_id: e.connectionId ?? null,
    });
    if (error) throw new Error(`insertUsage error: ${error.message}`);
  },
};
