/**
 * WhatsApp por organização (Sprint 2b).
 *
 * Resolve a conexão `active` da organização e devolve o provedor já com as
 * credenciais dela. Sem conexão → ConnectionNotConfiguredError (sem fallback).
 */
import { resolveConnection } from '@/lib/connectors/resolve-connection';
import type { IWhatsAppProvider } from './whatsapp-provider.interface';
import { EvolutionProvider } from './providers/evolution.provider';
import { MetaCloudProvider } from './providers/meta-cloud.provider';

export interface OrgWhatsApp {
  provider: IWhatsAppProvider;
  /** instanceName (Evolution) ou phoneNumberId (Meta) */
  target: string;
  connectionId: string;
  organizationId: string;
}

type OrgWhatsAppFactory = (organizationId: string) => Promise<OrgWhatsApp>;

let override: OrgWhatsAppFactory | null = null;

/** Apenas para testes: substitui a resolução real. `null` restaura. */
export function setWhatsAppProviderFactoryForTests(fn: OrgWhatsAppFactory | null): void {
  override = fn;
}

export async function getWhatsAppForOrganization(organizationId: string): Promise<OrgWhatsApp> {
  if (override) return override(organizationId);

  const conn = await resolveConnection(organizationId, 'whatsapp');
  const usage = { organizationId: conn.organizationId, connectionId: conn.id };

  if (conn.provider === 'meta_cloud') {
    const c = conn as Awaited<ReturnType<typeof resolveConnection<'meta_cloud'>>>;
    return {
      provider: new MetaCloudProvider({
        accessToken: c.secret.accessToken,
        phoneNumberId: c.config.phoneNumberId,
        apiVersion: c.config.apiVersion,
        appSecret: c.secret.appSecret,
        verifyToken: c.secret.verifyToken,
        usage,
      }),
      target: c.config.phoneNumberId,
      connectionId: c.id,
      organizationId: c.organizationId,
    };
  }

  const c = conn as Awaited<ReturnType<typeof resolveConnection<'evolution'>>>;
  return {
    provider: new EvolutionProvider({ baseUrl: c.config.baseUrl, apiKey: c.secret.apiKey, usage }),
    target: c.config.instanceName,
    connectionId: c.id,
    organizationId: c.organizationId,
  };
}
