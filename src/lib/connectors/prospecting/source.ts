/**
 * Fontes de prospecção (Google Places, Apify, Firecrawl) pela conexão
 * `prospecting/<provedor>` da organização do usuário. Sem organização ou sem
 * conexão ativa → ConnectionNotConfiguredError; nunca fallback para env.
 */
import { resolveConnection } from '../resolve-connection';
import { resolveOrganizationIdForUser } from '../org-context';
import { ConnectionNotConfiguredError, type ResolvedConnection } from '../types';

export type ProspectingProvider = 'google_places' | 'apify' | 'firecrawl';

export const PROSPECTING_SOURCE_NOT_CONFIGURED_ERROR = {
  code: 'PROSPECTING_SOURCE_NOT_CONFIGURED',
  message: 'Fonte de prospecção não configurada para esta organização. Fale com a equipe IntelliX.',
} as const;

export async function resolveProspectingConnectionForUser<P extends ProspectingProvider>(
  userId: string,
  provider: P
): Promise<ResolvedConnection<P>> {
  const organizationId = await resolveOrganizationIdForUser(userId);
  if (!organizationId) throw new ConnectionNotConfiguredError('', 'prospecting', provider);
  return resolveConnection(organizationId, 'prospecting', provider);
}

export function isProspectingSourceNotConfigured(err: unknown): boolean {
  return err instanceof ConnectionNotConfiguredError && err.category === 'prospecting';
}
