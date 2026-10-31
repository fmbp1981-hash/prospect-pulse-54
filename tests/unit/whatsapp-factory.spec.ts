/**
 * Task 10 (adicional) — com WHATSAPP_PROVIDER=meta o MetaCloudProvider usaria
 * credenciais globais e enviaria em nome de todos os tenants. Até o Sprint 2b
 * (conexões por organização) a factory deve falhar de forma explícita.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getWhatsAppProvider, resetWhatsAppProvider } from '@/lib/integrations/whatsapp/whatsapp.factory';

const original = process.env.WHATSAPP_PROVIDER;

beforeEach(() => resetWhatsAppProvider());
afterEach(() => {
  resetWhatsAppProvider();
  if (original === undefined) delete process.env.WHATSAPP_PROVIDER;
  else process.env.WHATSAPP_PROVIDER = original;
});

describe('getWhatsAppProvider', () => {
  it('meta → erro explícito (provider global desativado)', () => {
    process.env.WHATSAPP_PROVIDER = 'meta';
    expect(() => getWhatsAppProvider()).toThrow(/Provider Meta global desativado.*Sprint 2b/);
  });

  it('evolution (padrão) continua funcionando', () => {
    delete process.env.WHATSAPP_PROVIDER;
    expect(getWhatsAppProvider().name).toBe('evolution');
  });
});
