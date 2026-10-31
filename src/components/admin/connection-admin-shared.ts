/**
 * Compartilhado entre as telas do admin da plataforma (conexões por
 * organização e credenciais da plataforma): campos de formulário por provedor
 * e chamada às rotas /api/admin/* no formato `{ data }` / `{ error }`.
 *
 * As chaves dos campos espelham src/lib/connectors/schemas.ts; a validação
 * definitiva é a do servidor (mensagem do 400 exibida ao admin).
 */
import type { ProviderId } from '@/lib/connectors/types';

export interface FormField {
  key: string;
  label: string;
  placeholder?: string;
  optional?: boolean;
}

export const PROVIDER_CONFIG_FIELDS: Record<ProviderId, readonly FormField[]> = {
  meta_cloud: [
    { key: 'phoneNumberId', label: 'Phone Number ID', placeholder: '123456789012345' },
    { key: 'wabaId', label: 'WABA ID', optional: true },
    { key: 'apiVersion', label: 'Versão da API', placeholder: 'v20.0', optional: true },
  ],
  evolution: [
    { key: 'baseUrl', label: 'URL base da Evolution API', placeholder: 'https://evolution.exemplo.com.br' },
    { key: 'instanceName', label: 'Nome da instância' },
  ],
  resend: [
    { key: 'domain', label: 'Domínio de envio', placeholder: 'exemplo.com.br' },
    { key: 'fromEmail', label: 'E-mail remetente', placeholder: 'contato@exemplo.com.br' },
    { key: 'fromName', label: 'Nome do remetente' },
  ],
  openai: [{ key: 'model', label: 'Modelo', placeholder: 'gpt-4.1-mini', optional: true }],
  google_places: [],
  apify: [],
  firecrawl: [],
};

export const PROVIDER_SECRET_FIELDS: Record<ProviderId, readonly FormField[]> = {
  meta_cloud: [
    { key: 'accessToken', label: 'Access token' },
    { key: 'appSecret', label: 'App secret' },
    { key: 'verifyToken', label: 'Verify token (webhook)' },
  ],
  evolution: [{ key: 'apiKey', label: 'API key' }],
  resend: [{ key: 'apiKey', label: 'API key' }],
  openai: [{ key: 'apiKey', label: 'API key' }],
  google_places: [{ key: 'apiKey', label: 'API key' }],
  apify: [{ key: 'apiToken', label: 'API token' }],
  firecrawl: [{ key: 'apiKey', label: 'API key' }],
};

/** Placeholder de campo de segredo: nunca pré-preenchido, só o hint. */
export function secretPlaceholder(hasSecret: boolean, secretHint: string | null): string {
  if (!hasSecret) return '';
  return secretHint ? `configurado (…${secretHint})` : 'configurado';
}

/** Remove campos vazios; `undefined` quando nada foi preenchido. */
export function filledValues(values: Record<string, string>): Record<string, string> | undefined {
  const entries = Object.entries(values)
    .map(([k, v]) => [k, v.trim()] as const)
    .filter(([, v]) => v.length > 0);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

/** Chama uma rota /api/admin/* e devolve `data`; erro → AdminApiError com a mensagem da API. */
export async function adminRequest<T>(
  url: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as
    | { data?: T; error?: { code?: string; message?: string } }
    | null;
  if (!res.ok) {
    throw new AdminApiError(
      res.status,
      json?.error?.code ?? 'REQUEST_FAILED',
      json?.error?.message ?? 'Falha ao processar a solicitação.'
    );
  }
  return json?.data as T;
}
