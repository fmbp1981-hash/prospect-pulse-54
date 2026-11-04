/**
 * Acesso ao contexto do Cloudflare (bindings e vars do Worker) para o código
 * de servidor, fora das rotas. Fora do Worker (Vercel, testes) o
 * getCloudflareContext lança e as funções daqui devolvem o comportamento de
 * "não está no Cloudflare".
 */

import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { FollowUpQueue } from '@/lib/jobs/follow-up.contract';

/**
 * Como o cron de follow-up age:
 * - `queue`: reivindica e despacha para a fila FOLLOW_UP_QUEUE (produção)
 * - `disabled`: não faz nada (staging, que usa o banco de produção)
 * - `direct`: roda o job completo no próprio request (Vercel/dev)
 */
export type FollowUpMode = 'queue' | 'direct' | 'disabled';

const FOLLOW_UP_MODES: readonly FollowUpMode[] = ['queue', 'direct', 'disabled'];

async function getCloudflareEnv(): Promise<Record<string, unknown> | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env as unknown as Record<string, unknown>;
  } catch {
    // sem contexto Cloudflare (Vercel, testes)
    return null;
  }
}

function isFollowUpQueue(value: unknown): value is FollowUpQueue {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { sendBatch?: unknown }).sendBatch === 'function'
  );
}

/** Binding da fila de follow-up, quando rodando no Worker com `FOLLOW_UP_QUEUE`. */
export async function getFollowUpQueue(): Promise<FollowUpQueue | null> {
  const env = await getCloudflareEnv();
  const queue = env?.FOLLOW_UP_QUEUE;
  return isFollowUpQueue(queue) ? queue : null;
}

/**
 * Modo explícito do follow-up. No Cloudflare vale a var `FOLLOW_UP_MODE`
 * (wrangler.jsonc); ausente ou inválida = `queue` (sem binding, o cron
 * responde 503 em vez de enviar direto). Fora do Cloudflare = `direct`.
 */
export async function getFollowUpMode(): Promise<FollowUpMode> {
  const env = await getCloudflareEnv();
  if (!env) return 'direct';
  const value = env.FOLLOW_UP_MODE;
  return FOLLOW_UP_MODES.find((mode) => mode === value) ?? 'queue';
}
