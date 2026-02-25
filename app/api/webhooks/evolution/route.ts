/**
 * FLUXO 1 - WEBHOOK
 * Equivalente nativo ao node "Webhook" do workflow n8n.
 * Recebe eventos da Evolution API (POST /api/webhooks/evolution)
 *
 * Corresponde ao endpoint n8n: POST /Xpag_agente_response
 */

import { NextRequest, NextResponse } from 'next/server';
import { normalizeMessage } from '@/lib/services/message-normalizer.service';
import { checkAntiLoop } from '@/lib/guards/anti-loop.guard';
import { runXpagWorkflow } from '@/lib/workflows/xpag-lead-handler.workflow';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min timeout (equivalente ao n8n)

export async function POST(req: NextRequest) {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Extrai o nome da instância do header ou query param
  const instanceName =
    req.headers.get('x-instance-name') ||
    req.nextUrl.searchParams.get('instance') ||
    undefined;

  // NORMALIZAR DADOS
  const normalized = normalizeMessage(body, instanceName);

  // ANTI-LOOP (fromMe)
  const antiLoop = checkAntiLoop(normalized);
  if (!antiLoop.shouldProcess) {
    return NextResponse.json(
      { ignored: true, reason: antiLoop.reason },
      { status: 200 }
    );
  }

  // Executar workflow principal de forma assíncrona
  // Retornamos 200 imediatamente para a Evolution API não fazer retry
  runXpagWorkflow(normalized).catch((err) => {
    console.error('[Webhook] Workflow execution error:', err);
  });

  return NextResponse.json({ received: true }, { status: 200 });
}

// Health check
export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'evolution-webhook' });
}
