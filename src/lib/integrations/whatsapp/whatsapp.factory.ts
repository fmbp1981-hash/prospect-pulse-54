/**
 * @deprecated Shim legado (lê EVOLUTION_API_URL/EVOLUTION_API_KEY). A Task 5 do
 * Sprint 2b migra os chamadores para `getWhatsAppForOrganization`
 * (org-whatsapp.ts) e remove este arquivo. Não use em código novo.
 *
 * Factory de WhatsApp Provider.
 *
 * Configurar via variável de ambiente:
 *   WHATSAPP_PROVIDER=evolution  (padrão)
 *   WHATSAPP_PROVIDER=meta       (DESATIVADO até o Sprint 2b: lança erro)
 *
 * Troca de provider é feita apenas alterando o .env — zero mudança de código.
 */

import type { IWhatsAppProvider } from './whatsapp-provider.interface';
import { EvolutionProvider } from './providers/evolution.provider';

type ProviderName = 'evolution' | 'meta';

let _instance: IWhatsAppProvider | null = null;

export function getWhatsAppProvider(): IWhatsAppProvider {
  if (_instance) return _instance;

  const providerName = (process.env.WHATSAPP_PROVIDER as ProviderName) || 'evolution';

  switch (providerName) {
    case 'meta':
      // O MetaCloudProvider usa META_WA_PHONE_NUMBER_ID/META_WA_TOKEN globais e
      // ignora a instância: enviaria em nome de TODOS os tenants.
      throw new Error(
        'Provider Meta global desativado: configure conexões por organização (Sprint 2b)'
      );
    case 'evolution':
    default:
      _instance = new EvolutionProvider({
        baseUrl: process.env.EVOLUTION_API_URL ?? '',
        apiKey: process.env.EVOLUTION_API_KEY ?? '',
      });
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
