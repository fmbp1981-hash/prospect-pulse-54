import { createHash, randomBytes } from 'crypto';

export const KEY_PREFIX = 'lpk_';

/** Gera uma nova API key — mostrar ao usuário UMA ÚNICA VEZ */
export function generateApiKey(): string {
  // KEY_PREFIX é 'lpk_' (4 chars), precisamos de 63 hex chars, total = 67
  // Ajustado para 64 hex chars para total = 68: lpk_ (4) + 64 hex = 68
  return `${KEY_PREFIX}${randomBytes(32).toString('hex')}`;
}

/** Hash SHA-256 da chave — armazenar no banco, nunca a chave em si */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
