/**
 * Tipos base dos conectores por organização (Sprint 2b).
 */
import type { z } from 'zod';
import type { providerConfigSchemas, providerSecretSchemas } from './schemas';

export type ConnectorCategory = 'whatsapp' | 'email' | 'llm' | 'prospecting';

export type ProviderId =
  | 'meta_cloud'
  | 'evolution'
  | 'resend'
  | 'openai'
  | 'google_places'
  | 'apify'
  | 'firecrawl';

export type ConnectionStatus = 'pending_test' | 'active' | 'failing' | 'disabled';

export type CredentialSource = 'platform' | 'own';

export type UsageUnit = 'tokens' | 'requests' | 'messages' | 'emails' | 'pages';

export type ProviderConfig<P extends ProviderId> = z.infer<(typeof providerConfigSchemas)[P]>;
export type ProviderSecret<P extends ProviderId> = z.infer<(typeof providerSecretSchemas)[P]>;

export interface ResolvedConnection<P extends ProviderId = ProviderId> {
  id: string;
  organizationId: string;
  category: ConnectorCategory;
  provider: P;
  credentialSource: CredentialSource;
  config: ProviderConfig<P>;
  secret: ProviderSecret<P>;
}

export class ConnectionNotConfiguredError extends Error {
  readonly organizationId: string;
  readonly category: ConnectorCategory;
  readonly provider?: ProviderId;

  constructor(organizationId: string, category: ConnectorCategory, provider?: ProviderId) {
    super(
      `Conexão não configurada para a organização (categoria ${category}${provider ? `, provedor ${provider}` : ''})`
    );
    this.name = 'ConnectionNotConfiguredError';
    this.organizationId = organizationId;
    this.category = category;
    this.provider = provider;
  }
}
