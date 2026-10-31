/**
 * Entrada HTTP dos webhooks de WhatsApp autenticada pela CONEXÃO da organização.
 *
 * Rotas:
 *   /api/webhooks/whatsapp/<webhook_key>   → conexão pela chave opaca (Sprint 2b)
 *   /api/webhooks/evolution/<token>        → legado até o corte: token do usuário →
 *                                            organização → conexão whatsapp ativa
 *
 * Regras (as duas rotas):
 *   chave/token malformado                     → 401 sem tocar no banco
 *   chave/token desconhecido ou irresolúvel    → 401 (log com código, nunca a chave)
 *   Content-Length ou corpo > 1 MB             → 413
 *   Meta: X-Hub-Signature-256 inválida         → 401 (HMAC do corpo bruto com o appSecret da conexão)
 *   Evolution: apikey ≠ a da conexão           → 401 (header `apikey` ou campo `apikey` do corpo)
 *   Evolution: instância ≠ a da conexão        → 401
 *   Sem mensagens (status, ack, grupo)         → 200, nada processado
 *
 * A organização do evento é SEMPRE a da conexão. Processamento em
 * processInboundWhatsAppEvent (whatsapp-inbound.handler.ts), depois do 200.
 */

import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { resolveConnection, resolveConnectionByWebhookKey } from '@/lib/connectors/resolve-connection';
import { resolveOrganizationIdForUser } from '@/lib/connectors/org-context';
import { ConnectionNotConfiguredError, type ResolvedConnection } from '@/lib/connectors/types';
import { resolveTenantByWebhookToken } from '@/lib/services/tenant-resolver.service';
import { processInboundWhatsAppEvent } from './whatsapp-inbound.handler';
import { isWellFormedWebhookToken, safeEqual, verifyMetaSignature } from './webhook-token';
import { normalizeMetaPayload } from './normalizers/meta.normalizer';
import {
  extractEvolutionBodyApiKey,
  extractEvolutionInstance,
  normalizeEvolutionPayload,
} from './normalizers/evolution.normalizer';
import type { NormalizedInboundEvent } from './normalizers/inbound-event';

type WhatsAppConnection = ResolvedConnection<'meta_cloud' | 'evolution'>;
type MetaConnection = ResolvedConnection<'meta_cloud'>;
type EvolutionConnection = ResolvedConnection<'evolution'>;

/** Limite do corpo do webhook (1 MB). Mídia chega por URL/ID, não inline grande. */
const MAX_BODY_BYTES = 1024 * 1024;

const LOG = '[Webhook WhatsApp]';

function errorResponse(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}
const unauthorized = () => errorResponse(401, 'UNAUTHORIZED', 'Webhook não autorizado');
const payloadTooLarge = () => errorResponse(413, 'PAYLOAD_TOO_LARGE', 'Corpo maior que 1 MB');
const ok = (data: Record<string, unknown>) => NextResponse.json({ data, meta: {} }, { status: 200 });

// ─── Resolução da conexão ─────────────────────────────────────────────────────

/** Conexão pela chave da URL. Qualquer falha (inclusive exceção) → null + log mascarado. */
async function connectionByKey(key: string): Promise<WhatsAppConnection | null> {
  if (!isWellFormedWebhookToken(key)) return null;
  try {
    return await resolveConnectionByWebhookKey(key);
  } catch (err) {
    console.warn(LOG, 'webhook_connection_unresolvable', err instanceof Error ? err.name : 'unknown');
    return null;
  }
}

type LegacyResolution =
  | { kind: 'unauthorized' }
  | { kind: 'not_configured'; code: string; organizationId?: string }
  | { kind: 'ok'; connection: WhatsAppConnection };

/** Rota legada: token do usuário → organização → conexão whatsapp ativa. Nunca lê env. */
async function connectionByLegacyToken(token: string): Promise<LegacyResolution> {
  if (!isWellFormedWebhookToken(token)) return { kind: 'unauthorized' };
  const tenant = await resolveTenantByWebhookToken(token);
  if (!tenant) return { kind: 'unauthorized' };

  try {
    const organizationId = await resolveOrganizationIdForUser(tenant.userId);
    if (!organizationId) return { kind: 'not_configured', code: 'user_without_organization' };
    const connection = (await resolveConnection(organizationId, 'whatsapp')) as WhatsAppConnection;
    return { kind: 'ok', connection };
  } catch (err) {
    if (err instanceof ConnectionNotConfiguredError) {
      return { kind: 'not_configured', code: 'whatsapp_not_configured', organizationId: err.organizationId };
    }
    console.warn(LOG, 'webhook_connection_unresolvable', err instanceof Error ? err.name : 'unknown');
    return { kind: 'unauthorized' };
  }
}

// ─── Corpo ────────────────────────────────────────────────────────────────────

type RawBody = { raw: string } | { response: NextResponse };
type JsonBody = { json: unknown } | { response: NextResponse };

async function readLimitedBody(req: NextRequest): Promise<RawBody> {
  const declaredLength = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return { response: payloadTooLarge() };
  }
  const raw = await req.text();
  // Content-Length pode faltar (chunked): confere também o tamanho lido.
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return { response: payloadTooLarge() };
  }
  return { raw };
}

function parseJson(raw: string): JsonBody {
  try {
    return { json: JSON.parse(raw) as unknown };
  } catch {
    return { response: errorResponse(400, 'INVALID_JSON', 'Corpo JSON inválido') };
  }
}

// ─── Autenticação por provedor + normalização ────────────────────────────────

async function receiveMeta(req: NextRequest, conn: MetaConnection): Promise<NextResponse | NormalizedInboundEvent[]> {
  const body = await readLimitedBody(req);
  if ('response' in body) return body.response;

  // Assinatura sobre o corpo BRUTO, antes de qualquer parse.
  const signature = req.headers.get('x-hub-signature-256');
  if (!(await verifyMetaSignature(body.raw, signature, conn.secret.appSecret))) {
    console.warn(LOG, 'meta_signature_invalid', conn.id);
    return unauthorized();
  }

  const parsed = parseJson(body.raw);
  if ('response' in parsed) return parsed.response;

  const events = normalizeMetaPayload(parsed.json);
  const own = events.filter((e) => e.recipientId === conn.config.phoneNumberId);
  if (own.length < events.length) {
    console.warn(LOG, 'meta_phone_number_mismatch', conn.id, String(events.length - own.length));
  }
  return own;
}

async function receiveEvolution(
  req: NextRequest,
  conn: EvolutionConnection
): Promise<NextResponse | NormalizedInboundEvent[]> {
  // Header presente e errado → recusa antes de ler o corpo.
  const headerKey = req.headers.get('apikey');
  if (headerKey !== null && !safeEqual(headerKey, conn.secret.apiKey)) {
    console.warn(LOG, 'evolution_apikey_invalid', conn.id);
    return unauthorized();
  }

  const body = await readLimitedBody(req);
  if ('response' in body) return body.response;
  const parsed = parseJson(body.raw);
  if ('response' in parsed) return parsed.response;

  if (headerKey === null) {
    const bodyKey = extractEvolutionBodyApiKey(parsed.json);
    if (bodyKey === null || !safeEqual(bodyKey, conn.secret.apiKey)) {
      console.warn(LOG, 'evolution_apikey_invalid', conn.id);
      return unauthorized();
    }
  }

  if (extractEvolutionInstance(parsed.json) !== conn.config.instanceName) {
    console.warn(LOG, 'evolution_instance_mismatch', conn.id);
    return unauthorized();
  }

  return normalizeEvolutionPayload(parsed.json);
}

/** Autentica o corpo com a conexão e agenda o processamento de cada mensagem. */
async function receiveForConnection(req: NextRequest, conn: WhatsAppConnection): Promise<NextResponse> {
  const result =
    conn.provider === 'meta_cloud'
      ? await receiveMeta(req, conn as MetaConnection)
      : await receiveEvolution(req, conn as EvolutionConnection);
  if (result instanceof NextResponse) return result;

  if (result.length === 0) return ok({ received: 0 });

  for (const normalized of result) {
    const event = {
      ...normalized,
      provider: conn.provider,
      organizationId: conn.organizationId,
      connectionId: conn.id,
    };
    // 200 imediato (o provedor reenvia se demorar ~10s); waitUntil mantém a função viva.
    waitUntil(
      processInboundWhatsAppEvent({ organizationId: conn.organizationId, connectionId: conn.id, event }).catch(
        (err: unknown) => {
          console.error(LOG, 'inbound_processing_failed', conn.id, err instanceof Error ? err.name : 'unknown');
        }
      )
    );
  }
  return ok({ received: result.length });
}

// ─── Verificação Meta (GET) ───────────────────────────────────────────────────

function metaVerification(req: NextRequest, conn: WhatsAppConnection | null): Response {
  const params = req.nextUrl.searchParams;
  if (params.get('hub.mode') !== 'subscribe') return ok({ status: 'ok' });

  const verifyToken = params.get('hub.verify_token');
  if (
    !conn
    || conn.provider !== 'meta_cloud'
    || !verifyToken
    || !safeEqual(verifyToken, (conn as MetaConnection).secret.verifyToken)
  ) {
    return errorResponse(403, 'FORBIDDEN', 'verify_token inválido');
  }
  return new Response(params.get('hub.challenge') ?? '', { status: 200 });
}

// ─── Handlers exportados ──────────────────────────────────────────────────────

/** POST /api/webhooks/whatsapp/<key> */
export async function handleConnectionWebhookPost(req: NextRequest, key: string): Promise<NextResponse> {
  const conn = await connectionByKey(key);
  if (!conn) return unauthorized();
  return receiveForConnection(req, conn);
}

/** GET /api/webhooks/whatsapp/<key> — verificação Meta (hub.challenge) e health check. */
export async function handleConnectionWebhookVerification(req: NextRequest, key: string): Promise<Response> {
  const conn = await connectionByKey(key);
  if (!conn) return unauthorized();
  return metaVerification(req, conn);
}

/** POST /api/webhooks/evolution/<token> — legado até o corte. */
export async function handleLegacyTokenWebhookPost(req: NextRequest, token: string): Promise<NextResponse> {
  const resolution = await connectionByLegacyToken(token);
  if (resolution.kind === 'unauthorized') return unauthorized();
  if (resolution.kind === 'not_configured') {
    console.warn(LOG, 'Evento não processado:', resolution.code, resolution.organizationId ?? '');
    return ok({ received: 0, ignored: resolution.code });
  }
  return receiveForConnection(req, resolution.connection);
}

/** GET /api/webhooks/evolution/<token> — verificação Meta pela conexão da organização do token. */
export async function handleLegacyTokenWebhookVerification(req: NextRequest, token: string): Promise<Response> {
  const resolution = await connectionByLegacyToken(token);
  if (resolution.kind === 'unauthorized') return unauthorized();
  return metaVerification(req, resolution.kind === 'ok' ? resolution.connection : null);
}

/** GET /api/webhooks/evolution (sem token): só health check; sem conexão não há verify_token. */
export function handleWebhookHealthCheck(req: NextRequest): Response {
  return metaVerification(req, null);
}
