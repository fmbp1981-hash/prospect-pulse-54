/**
 * CRON: Rescue Human Mode
 * Varre leads presos em modo humano há mais de 2h sem ação do consultor
 * e os retorna ao bot automaticamente.
 *
 * Agendamento Vercel: a cada hora (ver vercel.json)
 * Invocação manual: GET /api/cron/rescue-human-mode  (com Authorization: Bearer <CRON_SECRET>)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const INACTIVITY_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 horas

function getServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: NextRequest) {
  // Valida autorização
  const authHeader = req.headers.get('authorization');
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;
  if (authHeader !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceClient();
  const cutoff = new Date(Date.now() - INACTIVITY_THRESHOLD_MS).toISOString();

  // Busca leads em modo humano cujo consultor não agiu há mais de 2h
  // Inclui leads onde data_ultima_acao_consultor é NULL (nunca houve ação registrada)
  // mas modo_atendimento = 'humano' — isso não deveria acontecer, mas trata como timed out
  const { data: stuckLeads, error } = await supabase
    .from('leads_prospeccao')
    .select('id, lead, whatsapp, data_ultima_acao_consultor')
    .eq('modo_atendimento', 'humano')
    .or(`data_ultima_acao_consultor.is.null,data_ultima_acao_consultor.lt.${cutoff}`);

  if (error) {
    console.error('[CronRescue] Query failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!stuckLeads || stuckLeads.length === 0) {
    return NextResponse.json({ rescued: 0, message: 'No stuck leads found' });
  }

  const ids = stuckLeads.map((l) => l.id);

  const { error: updateError } = await supabase
    .from('leads_prospeccao')
    .update({ modo_atendimento: 'bot' })
    .in('id', ids);

  if (updateError) {
    console.error('[CronRescue] Update failed:', updateError.message);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  console.log(`[CronRescue] Rescued ${ids.length} leads:`, ids);

  return NextResponse.json({
    rescued: ids.length,
    leads: stuckLeads.map((l) => ({
      id: l.id,
      lead: l.lead,
      lastConsultantAction: l.data_ultima_acao_consultor,
    })),
  });
}
