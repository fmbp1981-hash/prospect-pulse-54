/**
 * Resolvedor de conexões por organização.
 *
 * Só conexões `active` são resolvidas; ausência = ConnectionNotConfiguredError.
 * Nunca há fallback para env, outra conexão ou outra organização.
 */
import { decryptJson, type EncryptedSecret } from './crypto/secret-box';
import { providerConfigSchemas, providerSecretSchemas } from './schemas';
import {
  ConnectionNotConfiguredError,
  type ConnectorCategory,
  type ProviderId,
  type ResolvedConnection,
} from './types';
import {
  connectionsRepository,
  type ConnectionRow,
} from '@/lib/repositories/connections.repository';

async function buildResolved(row: ConnectionRow): Promise<ResolvedConnection> {
  const provider = row.provider as ProviderId;
  const category = row.category as ConnectorCategory;
  const notConfigured = () =>
    new ConnectionNotConfiguredError(row.organization_id, category, provider);

  let encrypted: EncryptedSecret | null;
  if (row.credential_source === 'platform') {
    const platform = await connectionsRepository.getPlatformCredential(provider);
    if (!platform) throw notConfigured();
    encrypted = platform.secret as unknown as EncryptedSecret;
  } else {
    encrypted = row.secret as unknown as EncryptedSecret | null;
    if (!encrypted) throw notConfigured();
  }

  const secret = providerSecretSchemas[provider].parse(await decryptJson<unknown>(encrypted));
  const config = providerConfigSchemas[provider].parse(row.config);

  return {
    id: row.id,
    organizationId: row.organization_id,
    category,
    provider,
    credentialSource: row.credential_source === 'platform' ? 'platform' : 'own',
    config,
    secret,
  } as ResolvedConnection;
}

export async function resolveConnection<P extends ProviderId>(
  organizationId: string,
  category: ConnectorCategory,
  provider?: P
): Promise<ResolvedConnection<P>> {
  const row = await connectionsRepository.findActive(organizationId, category, provider);
  if (!row) throw new ConnectionNotConfiguredError(organizationId, category, provider);
  return (await buildResolved(row)) as ResolvedConnection<P>;
}

/** Resolve pela chave do webhook (qualquer status exceto disabled). */
export async function resolveConnectionByWebhookKey(
  webhookKey: string
): Promise<ResolvedConnection<'meta_cloud' | 'evolution'> | null> {
  const row = await connectionsRepository.findByWebhookKey(webhookKey);
  if (!row) return null;
  if (row.provider !== 'meta_cloud' && row.provider !== 'evolution') return null;
  return (await buildResolved(row)) as ResolvedConnection<'meta_cloud' | 'evolution'>;
}
