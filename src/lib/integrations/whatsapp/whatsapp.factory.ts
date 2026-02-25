/**
 * Factory de WhatsApp Provider.
 *
 * Configurar via variável de ambiente:
 *   WHATSAPP_PROVIDER=evolution  (padrão)
 *   WHATSAPP_PROVIDER=meta
 *
 * Troca de provider é feita apenas alterando o .env — zero mudança de código.
 */

import type { IWhatsAppProvider } from './whatsapp-provider.interface';
import { EvolutionProvider } from './providers/evolution.provider';
import { MetaCloudProvider } from './providers/meta-cloud.provider';

type ProviderName = 'evolution' | 'meta';

let _instance: IWhatsAppProvider | null = null;

export function getWhatsAppProvider(): IWhatsAppProvider {
  if (_instance) return _instance;

  const providerName = (process.env.WHATSAPP_PROVIDER as ProviderName) || 'evolution';

  switch (providerName) {
    case 'meta':
      _instance = new MetaCloudProvider();
      break;
    case 'evolution':
    default:
      _instance = new EvolutionProvider();
  }

  console.log(`[WhatsAppFactory] Using provider: ${_instance.name}`);
  return _instance;
}

/** Para testes — força um provider específico */
export function setWhatsAppProvider(provider: IWhatsAppProvider): void {
  _instance = provider;
}

/** Para testes — reseta o singleton */
export function resetWhatsAppProvider(): void {
  _instance = null;
}
