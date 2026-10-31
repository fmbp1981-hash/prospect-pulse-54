/**
 * Formatador/lógica do status das conexões exibido ao cliente (Task 11).
 * Vitest roda em `node` (sem jsdom): testa as funções puras usadas pelo
 * hook useConnectionStatus, pela ConnectionStatusList e pelo NotConfiguredNotice.
 */
import { describe, expect, it } from 'vitest';
import {
  NOT_CONFIGURED_MESSAGES,
  categoryStatus,
  formatConnectionStatus,
  isConfigured,
  type ConnectionStatusItem,
} from '@/hooks/useConnectionStatus';

const item = (
  category: ConnectionStatusItem['category'],
  provider: ConnectionStatusItem['provider'],
  status: ConnectionStatusItem['status']
): ConnectionStatusItem => ({ category, provider, status, lastTestedAt: null });

describe('formatConnectionStatus', () => {
  it('active → "Conectado"', () => {
    expect(formatConnectionStatus('active').label).toBe('Conectado');
  });
  it('failing → "Com falha"', () => {
    expect(formatConnectionStatus('failing').label).toBe('Com falha');
  });
  it('pending_test → "Aguardando teste"', () => {
    expect(formatConnectionStatus('pending_test').label).toBe('Aguardando teste');
  });
  it('disabled → "Desativado"', () => {
    expect(formatConnectionStatus('disabled').label).toBe('Desativado');
  });
  it('ausente → "Não configurado"', () => {
    expect(formatConnectionStatus(undefined).label).toBe('Não configurado');
    expect(formatConnectionStatus(null).label).toBe('Não configurado');
  });
  it('só active tem o tom de sucesso', () => {
    expect(formatConnectionStatus('active').tone).toBe('success');
    expect(formatConnectionStatus('failing').tone).toBe('danger');
    expect(formatConnectionStatus(undefined).tone).toBe('muted');
  });
});

describe('categoryStatus', () => {
  it('sem conexão na categoria → undefined', () => {
    expect(categoryStatus([], 'whatsapp')).toBeUndefined();
    expect(categoryStatus([item('email', 'resend', 'active')], 'whatsapp')).toBeUndefined();
  });

  it('qualquer conexão ativa na categoria → active', () => {
    const list = [
      item('prospecting', 'apify', 'failing'),
      item('prospecting', 'google_places', 'active'),
    ];
    expect(categoryStatus(list, 'prospecting')).toBe('active');
  });

  it('filtra pelo provedor quando informado', () => {
    const list = [
      item('prospecting', 'apify', 'active'),
      item('prospecting', 'google_places', 'pending_test'),
    ];
    expect(categoryStatus(list, 'prospecting', 'google_places')).toBe('pending_test');
    expect(categoryStatus(list, 'prospecting', 'firecrawl')).toBeUndefined();
  });

  it('sem ativa: falha tem prioridade sobre aguardando teste e desativado', () => {
    const list = [
      item('whatsapp', 'evolution', 'disabled'),
      item('whatsapp', 'meta_cloud', 'failing'),
    ];
    expect(categoryStatus(list, 'whatsapp')).toBe('failing');
  });
});

describe('isConfigured', () => {
  it('só é configurado quando o status é active', () => {
    expect(isConfigured('active')).toBe(true);
    expect(isConfigured('pending_test')).toBe(false);
    expect(isConfigured('failing')).toBe(false);
    expect(isConfigured('disabled')).toBe(false);
    expect(isConfigured(undefined)).toBe(false);
  });
});

describe('NOT_CONFIGURED_MESSAGES', () => {
  it('textos exatos do aviso por categoria', () => {
    expect(NOT_CONFIGURED_MESSAGES.whatsapp).toBe(
      'WhatsApp não configurado para esta organização. Fale com a equipe IntelliX.'
    );
    expect(NOT_CONFIGURED_MESSAGES.email).toBe(
      'E-mail não configurado para esta organização. Fale com a equipe IntelliX.'
    );
    expect(NOT_CONFIGURED_MESSAGES.llm).toBe(
      'IA não configurada para esta organização. Fale com a equipe IntelliX.'
    );
    expect(NOT_CONFIGURED_MESSAGES.prospecting).toBe(
      'Fonte de prospecção não configurada para esta organização. Fale com a equipe IntelliX.'
    );
  });
});
