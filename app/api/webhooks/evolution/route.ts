/**
 * WEBHOOK ANTIGO, SEM TOKEN — desativado para POST (F-02).
 *
 * POST /api/webhooks/evolution  → 401 sempre. Não lê o payload nem processa nada:
 *   qualquer um podia enviar `instance` de outro tenant e criar leads, rodar o
 *   agente e enviar WhatsApp pelo número dele.
 *   Use POST /api/webhooks/evolution/<webhook_token> (ver Configurações).
 * GET  /api/webhooks/evolution  → só health check. Sem token não há conexão, logo
 *   não há verify_token: hub.mode=subscribe → 403 (Sprint 2b, sem env).
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleWebhookHealthCheck } from '@/lib/webhooks/connection-inbound.handler';

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
  return handleWebhookHealthCheck(req);
}
