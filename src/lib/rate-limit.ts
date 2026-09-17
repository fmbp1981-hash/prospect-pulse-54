/**
 * Rate limiting para rotas públicas sensíveis (ex: signup), via Upstash
 * Redis. Item 3 do plano pós multi-tenant
 * (docs/PLANO-PENDENCIAS-MULTITENANT.md).
 *
 * Se as credenciais Upstash não estiverem configuradas (ex: ambiente local
 * sem integração conectada), o limiter fica desabilitado e a rota segue
 * sem rate limit — nunca bloqueia a aplicação por falta de configuração.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

let limiter: Ratelimit | null | undefined;

function getLimiter(): Ratelimit | null {
  if (limiter !== undefined) return limiter;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn('[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN não configurados — rate limit desabilitado.');
    limiter = null;
    return limiter;
  }

  limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(5, '10 m'),
    analytics: true,
    prefix: 'leadfinder-ratelimit',
  });
  return limiter;
}

export interface RateLimitResult {
  limited: boolean;
  remaining: number;
}

/**
 * Verifica o limite para um identificador (IP, userId, etc). Nunca lança —
 * se o Upstash estiver indisponível/não configurado, sempre permite (fail
 * open), para uma rota pública não ficar refém de um provedor externo.
 */
export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  const rl = getLimiter();
  if (!rl) return { limited: false, remaining: Infinity };

  try {
    const { success, remaining } = await rl.limit(identifier);
    return { limited: !success, remaining };
  } catch (err) {
    console.error('[rate-limit] Erro ao consultar Upstash, permitindo requisição:', err);
    return { limited: false, remaining: Infinity };
  }
}

export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}
