/**
 * Consumidor da Cloudflare Queue `follow-up-sends` (lógica pura, testável sem
 * `.open-next`). Monta um POST para /api/internal/follow-up/process com o lote
 * e traduz cada resultado em ack/retry. Sem import de módulos de servidor
 * (supabase etc.) para não inflar o bundle do Worker.
 */

// Tipos duplicados de src/lib/jobs/follow-up.queue.ts (importar traria os
// repositories/supabase para o bundle do Worker). Manter em sincronia.
type FollowUpMessage = { leadId: string; followUpCount: number };
type FollowUpOutcome = 'sent' | 'skipped' | 'retry';

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

export async function handleFollowUpBatch(
  batch: QueueBatchLike<FollowUpMessage>,
  callRoute: (req: Request) => Promise<Response>,
  cronSecret: string
): Promise<void> {
  const request = new Request(PROCESS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cronSecret}`,
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

  let results: { id: string; outcome: FollowUpOutcome }[];
  try {
    const response = await callRoute(request);
    if (!response.ok) {
      console.error(`[queue] follow-up/process falhou: ${response.status}`);
      batch.retryAll({ delaySeconds: RETRY_DELAY_SECONDS });
      return;
    }
    const json = (await response.json()) as {
      data: { results: { id: string; outcome: FollowUpOutcome }[] };
    };
    results = json.data.results;
  } catch (err) {
    console.error('[queue] erro ao chamar follow-up/process:', err);
    batch.retryAll({ delaySeconds: RETRY_DELAY_SECONDS });
    return;
  }

  const outcomes = new Map(results.map((r) => [r.id, r.outcome]));
  for (const msg of batch.messages) {
    const outcome = outcomes.get(msg.id);
    if (outcome === 'sent' || outcome === 'skipped') msg.ack();
    else msg.retry({ delaySeconds: RETRY_DELAY_SECONDS });
  }
}
