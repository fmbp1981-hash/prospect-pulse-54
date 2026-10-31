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
  'id, organization_id, category, provider, credential_source, config, status, last_tested_at, last_test_result, configured_by, created_at, updated_at';

export interface UpsertConnectionInput {
  organizationId: string;
  category: ConnectorCategory;
  provider: ProviderId;
  credentialSource: CredentialSource;
  config: Json;
  /** Segredo já cifrado (EncryptedSecret) ou null para credential_source = 'platform'. */
  secret: Json | null;
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
          secret: input.secret,
          status: input.status ?? 'pending_test',
          configured_by: input.configuredBy ?? null,
        },
        { onConflict: 'organization_id,category,provider' }
      )
      .select(SUMMARY_COLUMNS)
      .single();
    if (error) throw new Error(`upsert error: ${error.message}`);
    return data as unknown as ConnectionSummary;
  },

  async setStatus(id: string, status: ConnectionStatus, result: string | null): Promise<void> {
    const { error } = await getServiceClient()
      .from('organization_connections')
      .update({
        status,
        last_test_result: result,
        last_tested_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error(`setStatus error: ${error.message}`);
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
