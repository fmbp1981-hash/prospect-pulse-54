/**
 * WEBHOOK DO WHATSAPP AUTENTICADO POR TENANT (Evolution API e Meta Cloud API)
 *
 * POST /api/webhooks/evolution/<webhook_token>  → eventos de mensagem
 * GET  /api/webhooks/evolution/<webhook_token>  → verificação Meta (hub.challenge)
 *
 * O <webhook_token> é user_settings.webhook_token do tenant (64 hex), exibido
 * em Configurações. A lógica fica em src/lib/webhooks/whatsapp-inbound.handler.ts.
 */

import type { NextRequest } from 'next/server';
import {
  handleWhatsAppInboundPost,
  handleWhatsAppVerification,
} from '@/lib/webhooks/whatsapp-inbound.handler';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  return handleWhatsAppInboundPost(req, params.token);
}

export async function GET(req: NextRequest) {
  return handleWhatsAppVerification(req);
}
