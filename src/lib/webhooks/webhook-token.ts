/**
 * Utilitários de autenticação do webhook do WhatsApp (F-02).
 *
 * O token do webhook é gerado no banco (user_settings.webhook_token,
 * 64 caracteres hex minúsculos) e vai no path da URL configurada na Evolution:
 *   POST /api/webhooks/evolution/<webhook_token>
 */

import { createHmac, timingSafeEqual } from 'crypto';

const WEBHOOK_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/** true só para 64 caracteres hex minúsculos (formato gerado pelo banco). */
export function isWellFormedWebhookToken(token: unknown): token is string {
  return typeof token === 'string' && WEBHOOK_TOKEN_PATTERN.test(token);
}

/** Comparação em tempo constante de duas strings (false se tamanhos diferem). */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Valida o header X-Hub-Signature-256 da Meta Cloud API:
 * "sha256=" + HMAC-SHA256(corpo bruto, app secret) em hex.
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const expected =
    'sha256=' + createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  return safeEqual(signatureHeader, expected);
}
