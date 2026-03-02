// FLUXO AUXILIAR - CRON KEEP-ALIVE SUPABASE
// Equivalente ao Schedule Trigger "5 Dias" do n8n.
//
// Configurar no vercel.json:
// { "crons": [{ "path": "/api/cron/keepalive", "schedule": "0 0 */5 * *" }] }

import { NextRequest, NextResponse } from 'next/server';
import { runSupabaseKeepAlive } from '@/lib/jobs/supabase-keepalive.job';

export const runtime = 'nodejs';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await runSupabaseKeepAlive();
  return NextResponse.json({ success: true });
}
