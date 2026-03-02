/**
 * CRON DE FOLLOW-UP DE LONGO PRAZO
 * Rodado 1x por dia às 9h (horário do servidor).
 *
 * vercel.json:
 * { "crons": [{ "path": "/api/cron/long-followup", "schedule": "0 12 * * *" }] }
 * (12h UTC = 9h BRT)
 */

import { NextRequest, NextResponse } from 'next/server';
import { runLongFollowUpJob } from '@/lib/jobs/long-followup.job';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const CRON_SECRET = process.env.CRON_SECRET;

  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await runLongFollowUpJob();
    return NextResponse.json({ success: true, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[Cron/LongFollowUp] Error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
