// FLUXO AUXILIAR - CRON KEEP-ALIVE SUPABASE
// Equivalente ao Schedule Trigger "5 Dias" do n8n.
//
// Configurar no vercel.json:
// { "crons": [{ "path": "/api/cron/keepalive", "schedule": "0 0 */5 * *" }] }

import { NextRequest, NextResponse } from 'next/server';
import { runSupabaseKeepAlive } from '@/lib/jobs/supabase-keepalive.job';
import { verifyCronRequest } from '@/lib/auth/cron-auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await runSupabaseKeepAlive();
  return NextResponse.json({ success: true });
}
