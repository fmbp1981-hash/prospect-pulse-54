/**
 * Resolvedor de conexões por organização.
 *
 * Só conexões `active` são resolvidas para uso (envio, IA, prospecção);
 * ausência = ConnectionNotConfiguredError. A ENTRADA de webhooks aceita
 * qualquer status exceto disabled (resolveConnectionByWebhookKey e
 * resolveInboundWhatsAppConnection). Nunca há fallback para env, outra
 * conexão ou outra organização.
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

/**
 * Monta a conexão resolvida a partir da linha, qualquer que seja o status
 * (segredo próprio decifrado ou credencial da plataforma do provedor).
 * Também usada pelo teste de conexão do admin, que precisa testar conexões
 * ainda não ativas. Sem segredo → ConnectionNotConfiguredError; config ou
 * segredo inválido → ZodError.
 */
export async function buildResolvedConnection(row: ConnectionRow): Promise<ResolvedConnection> {
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

export function resolveConnection<P extends ProviderId>(
  organizationId: string,
  category: 'prospecting',
  provider: P
): Promise<ResolvedConnection<P>>;
export function resolveConnection<P extends ProviderId>(
  organizationId: string,
  category: Exclude<ConnectorCategory, 'prospecting'>,
  provider?: P
): Promise<ResolvedConnection<P>>;
export async function resolveConnection<P extends ProviderId>(
  organizationId: string,
  category: ConnectorCategory,
  provider?: P
): Promise<ResolvedConnection<P>> {
  // prospecting admite várias conexões ativas (uma por provedor): sem provedor é ambíguo.
  if (category === 'prospecting' && !provider) {
    throw new Error('resolveConnection: provider é obrigatório para a categoria prospecting');
  }
  const row = await connectionsRepository.findActive(organizationId, category, provider);
  if (!row) throw new ConnectionNotConfiguredError(organizationId, category, provider);
  return (await buildResolvedConnection(row)) as ResolvedConnection<P>;
}

/** Resolve pela chave do webhook (qualquer status exceto disabled). */
export async function resolveConnectionByWebhookKey(
  webhookKey: string
): Promise<ResolvedConnection<'meta_cloud' | 'evolution'> | null> {
  const row = await connectionsRepository.findByWebhookKey(webhookKey);
  if (!row) return null;
  if (row.provider !== 'meta_cloud' && row.provider !== 'evolution') return null;
  return (await buildResolvedConnection(row)) as ResolvedConnection<'meta_cloud' | 'evolution'>;
}

/**
 * Conexão de WhatsApp da organização para ENTRADA (rota legada por token):
 * mesma regra da rota por chave — qualquer status exceto disabled —, para que
 * as mensagens recebidas sejam salvas logo depois da migração das conexões
 * (pending_test). Respostas continuam exigindo `active` (resolveConnection).
 * null quando a organização não tem conexão de WhatsApp utilizável.
 */
export async function resolveInboundWhatsAppConnection(
  organizationId: string
): Promise<ResolvedConnection<'meta_cloud' | 'evolution'> | null> {
  const row = await connectionsRepository.findInboundWhatsApp(organizationId);
  if (!row) return null;
  if (row.provider !== 'meta_cloud' && row.provider !== 'evolution') return null;
  return (await buildResolvedConnection(row)) as ResolvedConnection<'meta_cloud' | 'evolution'>;
}
