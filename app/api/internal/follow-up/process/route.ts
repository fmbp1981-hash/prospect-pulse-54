/**
 * PROCESSAMENTO DE FOLLOW-UP (consumidor da Cloudflare Queue)
 *
 * Chamada pelo handler `queue` do Worker via `handler.fetch`, com
 * `Authorization: Bearer <CRON_SECRET>`. Recebe até 10 mensagens, processa
 * cada uma e devolve o resultado por id; o Worker faz ack/retry conforme o
 * `outcome`. Na última entrega (attempts > FOLLOW_UP_MAX_RETRIES) com 'retry', libera o claim
 * do lead antes de responder, para o cron reivindicá-lo de novo com backoff.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyCronRequest } from '@/lib/auth/cron-auth';
import {
  FOLLOW_UP_MAX_RETRIES,
  processFollowUpMessage,
  type FollowUpOutcome,
} from '@/lib/jobs/follow-up.queue';
import { leadRepository } from '@/lib/repositories/lead.repository';

export const runtime = 'nodejs';

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        id: z.string().min(1),
        leadId: z.string().uuid(),
        followUpCount: z.number().int().min(0).max(2),
        attempts: z.number().int().min(1),
      })
    )
    .max(10),
});

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: NextRequest) {
  if (!verifyCronRequest(req)) {
    return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse('VALIDATION_ERROR', 'Invalid follow-up messages', 400);
  }

  const results: { id: string; outcome: FollowUpOutcome }[] = [];

  // Sequencial: evita rajada de envios pela mesma conexão de WhatsApp.
  for (const msg of parsed.data.messages) {
    let outcome: FollowUpOutcome;
    try {
      outcome = await processFollowUpMessage({ leadId: msg.leadId, followUpCount: msg.followUpCount });
    } catch (err) {
      console.error('[FollowUp/Process] erro ao processar mensagem', {
        leadId: msg.leadId,
        error: err instanceof Error ? err.message : String(err),
      });
      outcome = 'retry';
    }

    if (outcome === 'retry' && msg.attempts > FOLLOW_UP_MAX_RETRIES) {
      try {
        await leadRepository.releaseFollowUpClaim(msg.leadId);
      } catch (err) {
        // A trava de 5 min do claim expira sozinha; só registra.
        console.error('[FollowUp/Process] falha ao liberar claim', {
          leadId: msg.leadId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    results.push({ id: msg.id, outcome });
  }

  return NextResponse.json({ data: { results } });
}
