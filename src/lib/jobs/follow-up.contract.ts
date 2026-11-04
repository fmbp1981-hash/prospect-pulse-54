/**
 * CONTRATO DO FOLLOW-UP POR FILA
 *
 * Fonte única dos tipos trocados entre o cron (produtor), a Cloudflare Queue,
 * o consumidor do Worker (src/worker/follow-up-consumer.ts, custom-worker.ts)
 * e a rota POST /api/internal/follow-up/process.
 *
 * Só tipos, constantes e schemas zod, sem dependência de servidor (supabase,
 * repositories): os arquivos do Worker importam daqui com `import type`.
 */

import { z } from 'zod';

/** Corpo de cada mensagem da fila `follow-up-sends`. */
export type FollowUpMessage = { leadId: string; followUpCount: number };

/** Formato estrutural do binding de Queue do Cloudflare (só o que usamos). */
export interface FollowUpQueue {
  sendBatch(messages: { body: FollowUpMessage }[]): Promise<void>;
}

export const followUpOutcomeSchema = z.enum(['sent', 'skipped', 'retry']);
export type FollowUpOutcome = z.infer<typeof followUpOutcomeSchema>;

/**
 * max_retries do consumidor da fila (wrangler.jsonc → queues.consumers). O
 * Cloudflare começa `attempts` em 1, então há FOLLOW_UP_MAX_RETRIES + 1
 * entregas; a última é `attempts > FOLLOW_UP_MAX_RETRIES`. Manter em
 * sincronia com o wrangler.jsonc.
 */
export const FOLLOW_UP_MAX_RETRIES = 3;

/** Status em que o lead ainda está na conversa do bot (mesmos da RPC de claim). */
export const FOLLOW_UP_DUE_STATUSES: readonly string[] = ['Em Conversa', 'Qualificando'];

/** Máximo de mensagens por chamada (max_batch_size do consumidor). */
export const FOLLOW_UP_PROCESS_MAX_MESSAGES = 10;

export const processMessageSchema = z.object({
  id: z.string().min(1),
  leadId: z.string().uuid(),
  followUpCount: z.number().int().min(0).max(2),
  attempts: z.number().int().min(1),
});
export type ProcessMessage = z.infer<typeof processMessageSchema>;

export const processRequestSchema = z.object({
  messages: z.array(processMessageSchema).max(FOLLOW_UP_PROCESS_MAX_MESSAGES),
});
export type ProcessRequest = z.infer<typeof processRequestSchema>;

export const processResultSchema = z.object({
  id: z.string(),
  outcome: followUpOutcomeSchema,
});
export type ProcessResult = z.infer<typeof processResultSchema>;

export const processResponseSchema = z.object({
  data: z.object({ results: z.array(processResultSchema) }),
  meta: z.object({ processed: z.number().int().min(0) }),
});
export type ProcessResponse = z.infer<typeof processResponseSchema>;
