/**
 * FLUXO 4 - CRON DE FOLLOW-UP
 * Endpoint chamado pelo Vercel Cron (ou qualquer scheduler) a cada 1 minuto.
 * Equivalente ao "Schedule Trigger (1 min)" do n8n.
 *
 * Configurar no vercel.json:
 * { "crons": [{ "path": "/api/cron/follow-up", "schedule": "* * * * *" }] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { runFollowUpJob } from '@/lib/jobs/follow-up.job';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  // Valida o segredo do cron para evitar execuções não autorizadas
  const authHeader = req.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await runFollowUpJob();
    return NextResponse.json({ success: true, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[Cron/FollowUp] Error:', err);
    return NextResponse.json(
      { error: 'Follow-up job failed', details: String(err) },
      { status: 500 }
    );
  }
}
