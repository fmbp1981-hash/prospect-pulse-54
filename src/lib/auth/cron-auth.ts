/**
 * Autenticação única dos crons (/api/cron/*) e das rotas admin acionadas por
 * segredo (rag-ingest, register-templates, test-email).
 *
 * - Só aceita o header `Authorization: Bearer <CRON_SECRET>`; segredo em query
 *   string nunca vale (vaza em log de acesso, histórico e Referer).
 * - CRON_SECRET ausente ou vazio → sempre false (nada de `Bearer undefined`).
 * - Comparação em tempo constante: os dois lados viram SHA-256 (buffers de
 *   mesmo tamanho) antes do timingSafeEqual.
 *
 * verifyInternalRequest: mesma regra com o segredo dedicado
 * INTERNAL_QUEUE_SECRET, só para POST /api/internal/follow-up/process
 * (consumidor da fila). O CRON_SECRET não vale lá.
 */

import { createHash, timingSafeEqual } from 'crypto';

const BEARER_PREFIX = 'Bearer ';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function verifyBearer(req: Request, secret: string | undefined): boolean {
  if (!secret) return false;

  const header = req.headers.get('authorization');
  if (!header || !header.startsWith(BEARER_PREFIX)) return false;

  const provided = header.slice(BEARER_PREFIX.length);
  if (!provided) return false;

  return timingSafeEqual(digest(provided), digest(secret));
}

export function verifyCronRequest(req: Request): boolean {
  return verifyBearer(req, process.env.CRON_SECRET);
}

export function verifyInternalRequest(req: Request): boolean {
  return verifyBearer(req, process.env.INTERNAL_QUEUE_SECRET);
}
