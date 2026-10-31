'use client';

/**
 * Status das conexões da organização do usuário (GET /api/connections/status).
 *
 * Qualquer membro lê; nada de config/segredo vem nessa resposta. As funções
 * puras exportadas aqui são a fonte única dos rótulos e da regra "configurado
 * = status active" usada pelas telas (ConnectionStatusList, NotConfiguredNotice).
 */
import { useQuery } from '@tanstack/react-query';
import type {
  ConnectionStatus,
  ConnectorCategory,
  ProviderId,
} from '@/lib/connectors/types';

export interface ConnectionStatusItem {
  category: ConnectorCategory;
  provider: ProviderId;
  status: ConnectionStatus;
  lastTestedAt: string | null;
}

export type StatusTone = 'success' | 'warning' | 'danger' | 'muted';

export interface StatusDisplay {
  label: string;
  tone: StatusTone;
}

const STATUS_DISPLAY: Record<ConnectionStatus, StatusDisplay> = {
  active: { label: 'Conectado', tone: 'success' },
  failing: { label: 'Com falha', tone: 'danger' },
  pending_test: { label: 'Aguardando teste', tone: 'warning' },
  disabled: { label: 'Desativado', tone: 'muted' },
};

const NOT_CONFIGURED_DISPLAY: StatusDisplay = { label: 'Não configurado', tone: 'muted' };

export function formatConnectionStatus(status: ConnectionStatus | null | undefined): StatusDisplay {
  return status ? STATUS_DISPLAY[status] : NOT_CONFIGURED_DISPLAY;
}

export const CATEGORY_LABELS: Record<ConnectorCategory, string> = {
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  llm: 'Inteligência artificial',
  prospecting: 'Prospecção',
};

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  meta_cloud: 'Meta Cloud API',
  evolution: 'Evolution API',
  resend: 'Resend',
  openai: 'OpenAI',
  google_places: 'Google Places',
  apify: 'Apify (LinkedIn)',
  firecrawl: 'Firecrawl',
};

export const NOT_CONFIGURED_MESSAGES: Record<ConnectorCategory, string> = {
  whatsapp: 'WhatsApp não configurado para esta organização. Fale com a equipe IntelliX.',
  email: 'E-mail não configurado para esta organização. Fale com a equipe IntelliX.',
  llm: 'IA não configurada para esta organização. Fale com a equipe IntelliX.',
  prospecting:
    'Fonte de prospecção não configurada para esta organização. Fale com a equipe IntelliX.',
};

/** Ordem de "melhor" status quando há mais de uma conexão na categoria. */
const STATUS_PRIORITY: readonly ConnectionStatus[] = ['active', 'failing', 'pending_test', 'disabled'];

/**
 * Status efetivo de uma categoria (opcionalmente de um provedor): `active` se
 * alguma conexão estiver ativa; senão o mais relevante; sem conexão → undefined.
 */
export function categoryStatus(
  items: readonly ConnectionStatusItem[],
  category: ConnectorCategory,
  provider?: ProviderId
): ConnectionStatus | undefined {
  const statuses = items
    .filter((i) => i.category === category && (!provider || i.provider === provider))
    .map((i) => i.status);
  return STATUS_PRIORITY.find((s) => statuses.includes(s));
}

export function isConfigured(status: ConnectionStatus | null | undefined): boolean {
  return status === 'active';
}

export const CONNECTION_STATUS_QUERY_KEY = ['connection-status'] as const;

async function fetchConnectionStatus(): Promise<ConnectionStatusItem[]> {
  const res = await fetch('/api/connections/status');
  if (!res.ok) throw new Error('Falha ao carregar o status das integrações');
  const body = (await res.json()) as { data?: ConnectionStatusItem[] };
  return body.data ?? [];
}

export function useConnectionStatus() {
  const query = useQuery({
    queryKey: CONNECTION_STATUS_QUERY_KEY,
    queryFn: fetchConnectionStatus,
    staleTime: 60 * 1000,
  });
  const items = query.data ?? [];
  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    statusOf: (category: ConnectorCategory, provider?: ProviderId) =>
      categoryStatus(items, category, provider),
  };
}
