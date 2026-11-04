import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * Mantém a promise viva depois de a resposta HTTP ser enviada (ctx.waitUntil do Cloudflare Workers).
 * Sem contexto Cloudflare (Vitest, `next dev`), a promise apenas corre solta e a rejeição é logada.
 */
export function runAfterResponse(task: Promise<unknown>): void {
  try {
    getCloudflareContext().ctx.waitUntil(task);
    return;
  } catch {
    // sem contexto Cloudflare: segue para o fallback
  }
  task.catch((err: unknown) => {
    console.error('[after-response]', err);
  });
}
