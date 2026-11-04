/**
 * Consumidor da Cloudflare Queue `follow-up-sends` (lógica pura, testável sem
 * `.open-next`). Monta um POST para /api/internal/follow-up/process com o lote
 * e traduz cada resultado em ack/retry. Só `import type` do contrato: nada de
 * módulos de servidor (supabase etc.) no bundle do Worker.
 */

import type { FollowUpMessage, FollowUpOutcome, ProcessResult } from '../lib/jobs/follow-up.contract';

// Formato estrutural mínimo de MessageBatch do Cloudflare (os tipos do runtime
// de Workers não entram no tsconfig principal por conflitarem com o DOM).
export interface QueueMessageLike<Body> {
  readonly id: string;
  readonly body: Body;
  readonly attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}
export interface QueueBatchLike<Body> {
  readonly messages: readonly QueueMessageLike<Body>[];
  retryAll(options?: { delaySeconds?: number }): void;
}

const PROCESS_URL = 'https://internal/api/internal/follow-up/process';
const RETRY_DELAY_SECONDS = 30;
const ACK_OUTCOMES: readonly FollowUpOutcome[] = ['sent', 'skipped'];

/** Confere a forma `{ data: { results: [{ id, outcome }] } }` sem zod (bundle do Worker). */
function readResults(json: unknown): ProcessResult[] | null {
  if (typeof json !== 'object' || json === null) return null;
  const data = (json as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return null;
  const results = (data as { results?: unknown }).results;
  if (!Array.isArray(results)) return null;
  return results.filter(
    (r): r is ProcessResult =>
      typeof r === 'object' &&
      r !== null &&
      typeof (r as { id?: unknown }).id === 'string' &&
      typeof (r as { outcome?: unknown }).outcome === 'string'
  );
}

export async function handleFollowUpBatch(
  batch: QueueBatchLike<FollowUpMessage>,
  callRoute: (req: Request) => Promise<Response>,
  internalSecret: string
): Promise<void> {
  const request = new Request(PROCESS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${internalSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: batch.messages.map((m) => ({
        id: m.id,
        leadId: m.body.leadId,
        followUpCount: m.body.followUpCount,
        attempts: m.attempts,
      })),
    }),
  });

  let results: ProcessResult[] | null;
  try {
    const response = await callRoute(request);
    if (!response.ok) {
      console.error(`[queue] follow-up/process falhou: ${response.status}`);
      batch.retryAll({ delaySeconds: RETRY_DELAY_SECONDS });
      return;
    }
    results = readResults(await response.json());
  } catch (err) {
    console.error('[queue] erro ao chamar follow-up/process:', err instanceof Error ? err.name : typeof err);
    batch.retryAll({ delaySeconds: RETRY_DELAY_SECONDS });
    return;
  }

  if (!results) {
    console.error('[queue] follow-up/process respondeu num formato inválido');
    batch.retryAll({ delaySeconds: RETRY_DELAY_SECONDS });
    return;
  }

  const outcomes = new Map(results.map((r) => [r.id, r.outcome]));
  for (const msg of batch.messages) {
    const outcome = outcomes.get(msg.id);
    if (outcome !== undefined && ACK_OUTCOMES.includes(outcome)) msg.ack();
    else msg.retry({ delaySeconds: RETRY_DELAY_SECONDS });
  }
}
