/**
 * Entry customizado do Worker — envolve o handler `fetch` gerado pelo
 * OpenNext e adiciona um handler `scheduled` para os Cron Triggers do
 * Cloudflare (Vercel Cron não existe aqui; ver CLOUDFLARE_MIGRATION_PLAN.md,
 * Fase 2). Cada cron dispara uma requisição interna pro Route Handler
 * correspondente, autenticada com o mesmo CRON_SECRET que as rotas já
 * validam hoje.
 */
// @ts-ignore `.open-next/worker.js` é gerado em build time (npm run cf:build)
import { default as handler } from './.open-next/worker.js';

// Mapeamento schedule (cron do wrangler.jsonc) -> rota interna do Next.js
const CRON_ROUTES: Record<string, string> = {
  '* * * * *': '/api/cron/follow-up',
  '0 12 * * 1-5': '/api/cron/long-followup',
  '0 * * * *': '/api/cron/rescue-human-mode',
  '0 0 */5 * *': '/api/cron/keepalive',
};

export default {
  fetch: handler.fetch,

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const path = CRON_ROUTES[event.cron];
    if (!path) {
      console.error(`[scheduled] Nenhuma rota mapeada para o cron "${event.cron}"`);
      return;
    }

    const request = new Request(`https://internal${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    });

    const response = await handler.fetch(request, env, ctx);
    if (!response.ok) {
      console.error(`[scheduled] ${path} falhou: ${response.status} ${await response.text()}`);
    }
  },
} satisfies ExportedHandler<Env>;

// Re-exporta os handlers de Durable Object do OpenNext (cache incremental
// distribuído) — necessário mesmo sem usá-los hoje, pois open-next.config.ts
// pode passar a habilitá-los sem precisar tocar neste arquivo de novo.
export { DOQueueHandler, DOShardedTagCache } from './.open-next/worker.js';
