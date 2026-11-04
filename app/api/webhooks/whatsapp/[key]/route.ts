/**
 * WEBHOOK DE WHATSAPP POR CONEXÃO (Sprint 2b)
 *
 * POST /api/webhooks/whatsapp/<webhook_key>  → eventos de mensagem (Meta Cloud API ou Evolution)
 * GET  /api/webhooks/whatsapp/<webhook_key>  → verificação Meta (hub.challenge)
 *
 * <webhook_key> é organization_connections.webhook_key (64 hex), exibida ao
 * admin da plataforma na tela de integrações. A lógica fica em
 * src/lib/webhooks/connection-inbound.handler.ts.
 */

import type { NextRequest } from 'next/server';
import {
  handleConnectionWebhookPost,
  handleConnectionWebhookVerification,
} from '@/lib/webhooks/connection-inbound.handler';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: { key: string } }) {
  return handleConnectionWebhookPost(req, params.key);
}

export async function GET(req: NextRequest, { params }: { params: { key: string } }) {
  return handleConnectionWebhookVerification(req, params.key);
}
