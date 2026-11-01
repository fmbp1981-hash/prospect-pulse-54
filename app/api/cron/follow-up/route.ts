/**
 * FLUXO 4 - CRON DE FOLLOW-UP
 * Endpoint chamado pelo scheduler a cada 1 minuto.
 * Equivalente ao "Schedule Trigger (1 min)" do n8n.
 *
 * No Cloudflare (binding `FOLLOW_UP_QUEUE` presente) só reivindica os leads e
 * despacha uma mensagem por lead para a fila; o envio acontece no consumidor
 * (POST /api/internal/follow-up/process). Sem o binding (Vercel, `next dev`),
 * roda o job completo como antes (runFollowUpJob).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { runFollowUpJob } from '@/lib/jobs/follow-up.job';
import { dispatchDueFollowUps, type FollowUpQueue } from '@/lib/jobs/follow-up.queue';
import { verifyCronRequest } from '@/lib/auth/cron-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Binding da fila, quando rodando no Worker com `FOLLOW_UP_QUEUE` configurado. */
async function getFollowUpQueue(): Promise<FollowUpQueue | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const queue = (env as { FOLLOW_UP_QUEUE?: FollowUpQueue }).FOLLOW_UP_QUEUE;
    return queue ?? null;
  } catch {
    // sem contexto Cloudflare: segue pelo job direto
    return null;
  }
}

export async function GET(req: NextRequest) {
  // Authorization: Bearer <CRON_SECRET> (tempo constante; sem CRON_SECRET → 401)
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const queue = await getFollowUpQueue();
    if (queue) {
      const dispatched = await dispatchDueFollowUps(queue);
      return NextResponse.json({ success: true, mode: 'queue', dispatched, timestamp: new Date().toISOString() });
    }

    await runFollowUpJob();
    return NextResponse.json({ success: true, mode: 'direct', timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[Cron/FollowUp] Error:', err);
    return NextResponse.json(
      { error: 'Follow-up job failed', details: String(err) },
      { status: 500 }
    );
  }
}
