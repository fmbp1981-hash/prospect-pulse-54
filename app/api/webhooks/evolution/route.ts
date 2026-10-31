/**
 * WEBHOOK ANTIGO, SEM TOKEN — desativado para POST (F-02).
 *
 * POST /api/webhooks/evolution  → 401 sempre. Não lê o payload nem processa nada:
 *   qualquer um podia enviar `instance` de outro tenant e criar leads, rodar o
 *   agente e enviar WhatsApp pelo número dele.
 *   Use POST /api/webhooks/evolution/<webhook_token> (ver Configurações).
 * GET  /api/webhooks/evolution  → verificação Meta (hub.challenge) e health check,
 *   mantidos para não quebrar a verificação já cadastrada na Meta.
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleWhatsAppVerification } from '@/lib/webhooks/whatsapp-inbound.handler';

export const runtime = 'nodejs';

export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      error: {
        code: 'UNAUTHORIZED',
        message:
          'Webhook sem token desativado. Configure a URL /api/webhooks/evolution/<seu-token> exibida em Configurações.',
      },
    },
    { status: 401 }
  );
}

export async function GET(req: NextRequest) {
  return handleWhatsAppVerification(req);
}
