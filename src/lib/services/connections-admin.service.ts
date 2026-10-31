/**
 * Serviço do admin da PLATAFORMA para conexões por organização e credenciais
 * da plataforma (Sprint 2b).
 *
 * As visões devolvidas nunca contêm segredo: só `hasSecret` e `secretHint`
 * (4 últimos caracteres do campo principal). `webhookUrl` (derivada do
 * webhook_key, legível só por service role) só aparece aqui, que é chamado
 * apenas por rotas restritas ao admin da plataforma.
 */
import type { Json } from '@/integrations/supabase/types';
import {
  connectionsRepository,
  type ConnectionRow,
  type PlatformCredentialRow,
} from '@/lib/repositories/connections.repository';
import { decryptJson, encryptJson, type EncryptedSecret } from '@/lib/connectors/crypto/secret-box';
import { buildResolvedConnection } from '@/lib/connectors/resolve-connection';
import { testConnection, type ConnectionTestResult } from '@/lib/connectors/testers';
import { resolveOrganizationIdForUser } from '@/lib/connectors/org-context';
import type {
  ConnectionStatus,
  ConnectorCategory,
  CredentialSource,
  ProviderId,
} from '@/lib/connectors/types';
import type {
  UpsertConnectionBody,
  UpsertPlatformCredentialBody,
} from '@/lib/validations/connections';

export class ConnectionsAdminError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ConnectionsAdminError';
  }
}

export interface ConnectionView {
  id: string;
  category: ConnectorCategory;
  provider: ProviderId;
  credentialSource: CredentialSource;
  config: Json;
  status: ConnectionStatus;
  lastTestedAt: string | null;
  lastTestResult: string | null;
  hasSecret: boolean;
  secretHint: string | null;
  webhookUrl: string | null;
  configuredBy: string | null;
  updatedAt: string;
}

export interface PlatformCredentialView {
  provider: ProviderId;
  config: Json;
  hasSecret: boolean;
  secretHint: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

export interface ConnectionStatusView {
  category: ConnectorCategory;
  provider: ProviderId;
  status: ConnectionStatus;
  lastTestedAt: string | null;
}

/** Campo principal do segredo, usado para o hint. */
const PRIMARY_SECRET_FIELD: Record<ProviderId, string> = {
  meta_cloud: 'accessToken',
  evolution: 'apiKey',
  resend: 'apiKey',
  openai: 'apiKey',
  google_places: 'apiKey',
  apify: 'apiToken',
  firecrawl: 'apiKey',
};

const WEBHOOK_PROVIDERS: readonly string[] = ['meta_cloud', 'evolution'];

const notFound = () =>
  new ConnectionsAdminError(404, 'NOT_FOUND', 'Conexão não encontrada para esta organização.');

async function secretHint(provider: ProviderId, encrypted: Json | null): Promise<string | null> {
  if (!encrypted) return null;
  try {
    const plain = await decryptJson<Record<string, unknown>>(encrypted as unknown as EncryptedSecret);
    const value = plain?.[PRIMARY_SECRET_FIELD[provider]];
    return typeof value === 'string' && value.length >= 8 ? value.slice(-4) : null;
  } catch {
    // Chave mestra ausente/rotacionada: mostra que existe, sem hint.
    return null;
  }
}

function webhookUrl(row: ConnectionRow): string | null {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '');
  if (!appUrl || !row.webhook_key || !WEBHOOK_PROVIDERS.includes(row.provider)) return null;
  return `${appUrl}/api/webhooks/whatsapp/${row.webhook_key}`;
}

async function toView(row: ConnectionRow): Promise<ConnectionView> {
  const provider = row.provider as ProviderId;
  return {
    id: row.id,
    category: row.category as ConnectorCategory,
    provider,
    credentialSource: row.credential_source === 'platform' ? 'platform' : 'own',
    config: row.config,
    status: row.status as ConnectionStatus,
    lastTestedAt: row.last_tested_at,
    lastTestResult: row.last_test_result,
    hasSecret: row.secret !== null && row.secret !== undefined,
    secretHint: await secretHint(provider, row.secret),
    webhookUrl: webhookUrl(row),
    configuredBy: row.configured_by,
    updatedAt: row.updated_at,
  };
}

async function toPlatformView(row: PlatformCredentialRow): Promise<PlatformCredentialView> {
  const provider = row.provider as ProviderId;
  return {
    provider,
    config: row.config,
    hasSecret: row.secret !== null && row.secret !== undefined,
    secretHint: await secretHint(provider, row.secret),
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

async function loadView(organizationId: string, id: string): Promise<ConnectionView> {
  const row = await connectionsRepository.findByIdForOrganization(organizationId, id);
  if (!row) throw notFound();
  return toView(row);
}

export const connectionsAdminService = {
  listOrganizations(): Promise<Array<{ id: string; name: string }>> {
    return connectionsRepository.listOrganizations();
  },

  async listConnections(organizationId: string): Promise<ConnectionView[]> {
    const rows = await connectionsRepository.listRowsForOrganization(organizationId);
    return Promise.all(rows.map(toView));
  },

  /**
   * Cria/atualiza a conexão. Sem `secret` no corpo o segredo atual é mantido;
   * `own` sem segredo novo nem gravado → 400. Sempre volta para pending_test.
   */
  async saveConnection(
    organizationId: string,
    userId: string,
    body: UpsertConnectionBody
  ): Promise<ConnectionView> {
    let secret: Json | undefined;
    if (body.secret) {
      secret = (await encryptJson(body.secret)) as unknown as Json;
    } else if (body.credentialSource === 'own') {
      const existing = await connectionsRepository.findByKey(
        organizationId,
        body.category,
        body.provider
      );
      if (!existing?.secret) {
        throw new ConnectionsAdminError(
          400,
          'VALIDATION_ERROR',
          'Credencial própria exige o segredo na primeira configuração.'
        );
      }
    }

    const saved = await connectionsRepository.upsert({
      organizationId,
      category: body.category,
      provider: body.provider,
      credentialSource: body.credentialSource,
      config: body.config as Json,
      secret,
      status: 'pending_test',
      configuredBy: userId,
    });
    return loadView(organizationId, saved.id);
  },

  async setStatus(
    organizationId: string,
    connectionId: string,
    status: 'active' | 'disabled'
  ): Promise<ConnectionView> {
    const updated = await connectionsRepository.updateStatus(organizationId, connectionId, status);
    if (!updated) throw notFound();
    return loadView(organizationId, connectionId);
  },

  async deleteConnection(organizationId: string, connectionId: string): Promise<void> {
    const deleted = await connectionsRepository.deleteForOrganization(organizationId, connectionId);
    if (!deleted) throw notFound();
  },

  /**
   * Testa a conexão (qualquer status) e grava o resultado: ok → active,
   * falha → failing. A mensagem gravada/devolvida nunca contém segredo.
   */
  async testConnection(
    organizationId: string,
    connectionId: string
  ): Promise<{ connection: ConnectionView; result: ConnectionTestResult }> {
    const row = await connectionsRepository.findByIdForOrganization(organizationId, connectionId);
    if (!row) throw notFound();

    let result: ConnectionTestResult;
    try {
      const resolved = await buildResolvedConnection(row);
      result = await testConnection(resolved);
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      result = {
        ok: false,
        message:
          name === 'ConnectionNotConfiguredError'
            ? row.credential_source === 'platform'
              ? 'Credencial da plataforma não cadastrada para este provedor.'
              : 'Segredo da conexão não configurado.'
            : name === 'ZodError'
              ? 'Configuração ou segredo inválido para o provedor.'
              : 'Não foi possível preparar a conexão para o teste.',
      };
    }

    await connectionsRepository.setStatus(row.id, result.ok ? 'active' : 'failing', result.message);
    console.info('[connections-admin] test', {
      connectionId: row.id,
      provider: row.provider,
      ok: result.ok,
    });
    return { connection: await loadView(organizationId, connectionId), result };
  },

  async listPlatformCredentials(): Promise<PlatformCredentialView[]> {
    const rows = await connectionsRepository.listPlatformCredentials();
    return Promise.all(rows.map(toPlatformView));
  },

  async savePlatformCredential(
    userId: string,
    body: UpsertPlatformCredentialBody
  ): Promise<PlatformCredentialView> {
    const encrypted = (await encryptJson(body.secret)) as unknown as Json;
    await connectionsRepository.upsertPlatformCredential(
      body.provider,
      encrypted,
      body.config as Json,
      userId
    );
    const row = await connectionsRepository.getPlatformCredential(body.provider);
    if (!row) throw new Error('savePlatformCredential: credencial não encontrada após gravar');
    return toPlatformView(row);
  },

  /** Status das conexões da organização do usuário (qualquer membro). */
  async statusForUser(userId: string): Promise<ConnectionStatusView[]> {
    const organizationId = await resolveOrganizationIdForUser(userId);
    if (!organizationId) return [];
    const rows = await connectionsRepository.listForOrganization(organizationId);
    return rows.map((r) => ({
      category: r.category as ConnectorCategory,
      provider: r.provider as ProviderId,
      status: r.status as ConnectionStatus,
      lastTestedAt: r.last_tested_at,
    }));
  },
};
