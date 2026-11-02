/**
 * FLUXO 4 - CRON DE FOLLOW-UP
 * Endpoint chamado pelo scheduler a cada 1 minuto.
 * Equivalente ao "Schedule Trigger (1 min)" do n8n.
 *
 * Modo explícito (getFollowUpMode, var FOLLOW_UP_MODE do wrangler.jsonc):
 * - `queue` (produção no Cloudflare): só reivindica os leads e despacha uma
 *   mensagem por lead para a fila; o envio acontece no consumidor
 *   (POST /api/internal/follow-up/process). Sem o binding → 503, nunca envio
 *   direto.
 * - `disabled` (staging): responde 200 sem reivindicar nada.
 * - `direct` (fora do Cloudflare: Vercel, testes): roda o job completo
 *   (runFollowUpJob), como antes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runFollowUpJob } from '@/lib/jobs/follow-up.job';
import { dispatchDueFollowUps } from '@/lib/jobs/follow-up.queue';
import { verifyCronRequest } from '@/lib/auth/cron-auth';
import { getFollowUpMode, getFollowUpQueue } from '@/lib/runtime/bindings';
import { errorCode } from '@/lib/runtime/error-code';

export const runtime = 'nodejs';
export const maxDuration = 60;

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function meta() {
  return { timestamp: new Date().toISOString() };
}

export async function GET(req: NextRequest) {
  // Authorization: Bearer <CRON_SECRET> (tempo constante; sem CRON_SECRET → 401)
  if (!verifyCronRequest(req)) {
    return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
  }

  try {
    const mode = await getFollowUpMode();

    if (mode === 'disabled') {
      return NextResponse.json({ data: { mode, dispatched: 0 }, meta: meta() });
    }

    if (mode === 'queue') {
      const queue = await getFollowUpQueue();
      if (!queue) {
        console.error('[Cron/FollowUp] FOLLOW_UP_MODE=queue sem o binding FOLLOW_UP_QUEUE', {
          code: 'QUEUE_NOT_CONFIGURED',
        });
        return errorResponse('QUEUE_NOT_CONFIGURED', 'Follow-up queue binding is not configured', 503);
      }
      const dispatched = await dispatchDueFollowUps(queue);
      return NextResponse.json({ data: { mode, dispatched }, meta: meta() });
    }

    await runFollowUpJob();
    return NextResponse.json({ data: { mode }, meta: meta() });
  } catch (err) {
    console.error('[Cron/FollowUp] Error', {
      code: 'FOLLOW_UP_FAILED',
      error: errorCode(err),
    });
    return errorResponse('FOLLOW_UP_FAILED', 'Follow-up job failed', 500);
  }
}
