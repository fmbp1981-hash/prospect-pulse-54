/**
 * PROCESSAMENTO DE FOLLOW-UP (consumidor da Cloudflare Queue)
 *
 * Chamada só pelo handler `queue` do Worker via `handler.fetch`, com
 * `Authorization: Bearer <INTERNAL_QUEUE_SECRET>` e URL `https://internal/...`
 * (host que não existe fora do Worker). Recebe até 10 mensagens e devolve o
 * resultado por id; o Worker faz ack/retry conforme o `outcome`.
 *
 * A rota só autentica, valida, chama e responde: política de última entrega,
 * falha ambígua e espaçamento entre envios ficam em follow-up.queue.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalRequest } from '@/lib/auth/cron-auth';
import { processRequestSchema, type ProcessResponse } from '@/lib/jobs/follow-up.contract';
import { processFollowUpBatch } from '@/lib/jobs/follow-up.queue';
import { errorCode } from '@/lib/runtime/error-code';

export const runtime = 'nodejs';

/** Host usado pelo consumidor da fila em custom-worker.ts. */
const INTERNAL_HOST = 'internal';

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: NextRequest) {
  if (!verifyInternalRequest(req)) {
    return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
  }

  if (new URL(req.url).host !== INTERNAL_HOST) {
    return errorResponse('FORBIDDEN', 'Forbidden', 403);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 400);
  }

  const parsed = processRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse('VALIDATION_ERROR', 'Invalid follow-up messages', 400);
  }

  try {
    const results = await processFollowUpBatch(parsed.data.messages);
    const body: ProcessResponse = { data: { results }, meta: { processed: results.length } };
    return NextResponse.json(body);
  } catch (err) {
    console.error('[FollowUp/Process] erro ao processar o lote', { error: errorCode(err) });
    return errorResponse('INTERNAL_ERROR', 'Follow-up processing failed', 500);
  }
}
