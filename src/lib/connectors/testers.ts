/**
 * Teste de conexão por provedor (admin da plataforma).
 *
 * Cada teste faz UMA chamada autenticada barata à API do provedor, direto
 * (sem circuit breaker: um teste precisa de fato chegar na API) e com timeout.
 * A mensagem devolvida nunca contém segredo nem corpo da resposta do
 * provedor (que pode ecoar a chave): só o status HTTP ou um motivo genérico.
 */
import { withTimeout } from '@/lib/utils/resilience';
import { assertSafeOutboundUrl } from '@/lib/security/outbound-url';
import { checkResendDomainVerified } from './email/resend.adapter';
import type { ProviderId, ResolvedConnection } from './types';

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

export const TEST_TIMEOUT_MS = 10000;

type Tester<P extends ProviderId> = (conn: ResolvedConnection<P>) => Promise<ConnectionTestResult>;

const ok = (message: string): ConnectionTestResult => ({ ok: true, message });
const fail = (message: string): ConnectionTestResult => ({ ok: false, message });
const httpFail = (status: number) =>
  fail(
    status === 401 || status === 403
      ? `Credencial recusada pelo provedor (HTTP ${status}).`
      : `Provedor respondeu com erro (HTTP ${status}).`
  );

function get(url: string, headers: Record<string, string>): Promise<Response> {
  return fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(TEST_TIMEOUT_MS) });
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

const testers: { [P in ProviderId]: Tester<P> } = {
  async meta_cloud(conn) {
    const { apiVersion, phoneNumberId } = conn.config;
    const res = await get(
      `https://graph.facebook.com/${encodeURIComponent(apiVersion)}/${encodeURIComponent(phoneNumberId)}`,
      { Authorization: `Bearer ${conn.secret.accessToken}` }
    );
    return res.ok ? ok('Número do WhatsApp (Meta) acessível com a credencial.') : httpFail(res.status);
  },

  async evolution(conn) {
    const base = assertSafeOutboundUrl(conn.config.baseUrl).toString().replace(/\/+$/, '');
    const res = await get(
      `${base}/instance/connectionState/${encodeURIComponent(conn.config.instanceName)}`,
      { apikey: conn.secret.apiKey }
    );
    if (!res.ok) return httpFail(res.status);
    const body = (await readJson(res)) as { instance?: { state?: unknown }; state?: unknown } | null;
    const state = body?.instance?.state ?? body?.state;
    return state === 'open'
      ? ok('Instância Evolution conectada (state open).')
      : fail(`Instância Evolution não conectada (state ${typeof state === 'string' ? state : 'desconhecido'}).`);
  },

  async resend(conn) {
    const verified = await withTimeout(
      checkResendDomainVerified(conn.secret.apiKey, conn.config.domain),
      TEST_TIMEOUT_MS,
      'resend-domain-check'
    );
    return verified
      ? ok(`Domínio ${conn.config.domain} verificado no Resend.`)
      : fail(`Domínio ${conn.config.domain} não verificado no Resend (ou credencial recusada).`);
  },

  async openai(conn) {
    const res = await get('https://api.openai.com/v1/models', {
      Authorization: `Bearer ${conn.secret.apiKey}`,
    });
    return res.ok ? ok('Chave da OpenAI aceita.') : httpFail(res.status);
  },

  async google_places(conn) {
    // Find Place mínima: só place_id (SKU "ID only").
    const params = new URLSearchParams({
      input: 'Brasil',
      inputtype: 'textquery',
      fields: 'place_id',
      key: conn.secret.apiKey,
    });
    const res = await get(
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?${params.toString()}`,
      {}
    );
    if (!res.ok) return httpFail(res.status);
    const body = (await readJson(res)) as { status?: unknown } | null;
    const status = typeof body?.status === 'string' ? body.status : 'desconhecido';
    return status === 'OK' || status === 'ZERO_RESULTS'
      ? ok('Chave do Google Places aceita.')
      : fail(`Google Places recusou a chamada (status ${status}).`);
  },

  async apify(conn) {
    const res = await get('https://api.apify.com/v2/users/me', {
      Authorization: `Bearer ${conn.secret.apiToken}`,
    });
    return res.ok ? ok('Token do Apify aceito.') : httpFail(res.status);
  },

  async firecrawl(conn) {
    // Consulta de créditos da equipe: autenticada e sem consumo de créditos.
    const res = await get('https://api.firecrawl.dev/v2/team/credit-usage', {
      Authorization: `Bearer ${conn.secret.apiKey}`,
    });
    return res.ok ? ok('Chave do Firecrawl aceita.') : httpFail(res.status);
  },
};

export async function testConnection(conn: ResolvedConnection): Promise<ConnectionTestResult> {
  const tester = testers[conn.provider] as Tester<ProviderId>;
  try {
    return await tester(conn);
  } catch (err) {
    // Nunca repassa err.message: pode conter a URL com a chave (Google Places).
    const name = err instanceof Error ? err.name : '';
    const isTimeout =
      name === 'TimeoutError' ||
      name === 'AbortError' ||
      (err instanceof Error && err.message.startsWith('Timeout:'));
    if (isTimeout) return fail('Tempo esgotado ao contatar o provedor.');
    if (name === 'UnsafeOutboundUrlError') return fail('URL do provedor não permitida.');
    return fail('Falha de rede ao contatar o provedor.');
  }
}
