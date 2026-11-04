/**
 * Utilitários de autenticação dos webhooks do WhatsApp.
 *
 * Tokens/chaves de webhook têm 64 caracteres hex minúsculos (gerados no banco):
 *   - user_settings.webhook_token           → /api/webhooks/evolution/<token> (legado)
 *   - organization_connections.webhook_key  → /api/webhooks/whatsapp/<key>
 *
 * Só Web Crypto (sem node:crypto/Buffer): roda em Node 18+ e Cloudflare Workers.
 */

const WEBHOOK_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/** true só para 64 caracteres hex minúsculos (formato gerado pelo banco). */
export function isWellFormedWebhookToken(token: unknown): token is string {
  return typeof token === 'string' && WEBHOOK_TOKEN_PATTERN.test(token);
}

/**
 * Comparação em tempo constante de duas strings (bytes UTF-8).
 * Tamanhos diferentes → false (o tamanho não é segredo).
 */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const bytesA = enc.encode(a);
  const bytesB = enc.encode(b);
  if (bytesA.length !== bytesB.length) return false;
  let diff = 0;
  for (let i = 0; i < bytesA.length; i++) diff |= bytesA[i] ^ bytesB[i];
  return diff === 0;
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/**
 * Valida o header X-Hub-Signature-256 da Meta Cloud API:
 * "sha256=" + HMAC-SHA256(corpo bruto, app secret) em hex.
 * A comparação final é em tempo constante.
 */
export async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): Promise<boolean> {
  if (!signatureHeader || !appSecret) return false;
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  return safeEqual(signatureHeader, `sha256=${toHex(mac)}`);
}
