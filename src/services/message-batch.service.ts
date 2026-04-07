/**
 * MESSAGE BATCH SERVICE
 *
 * Agrupa mensagens consecutivas do mesmo lead enviadas em rápida sucessão.
 * Se o lead envia 3 mensagens em 2.5s, o agente processa tudo de uma vez
 * em vez de responder 3 vezes.
 *
 * Implementado com Map em memória + debounce por remoteJid.
 * Adequado para instância única (Vercel single-region ou dev local).
 */

const BATCH_DEBOUNCE_MS = 2500;

interface BatchEntry {
  messages: string[];
  timer: ReturnType<typeof setTimeout>;
  onFlush: (messages: string[]) => void;
}

const pending = new Map<string, BatchEntry>();

/**
 * Enfileira uma mensagem para o lead identificado por `key` (número WA).
 * Se uma mensagem anterior ainda está aguardando, o timer é reiniciado e
 * a nova mensagem é concatenada. O callback `onFlush` é chamado uma única
 * vez com todas as mensagens acumuladas.
 */
export function enqueueBatch(
  key: string,
  message: string,
  onFlush: (messages: string[]) => void
): void {
  const existing = pending.get(key);

  if (existing) {
    clearTimeout(existing.timer);
    existing.messages.push(message);
    existing.timer = setTimeout(() => {
      pending.delete(key);
      existing.onFlush(existing.messages);
    }, BATCH_DEBOUNCE_MS);
  } else {
    const entry: BatchEntry = {
      messages: [message],
      onFlush,
      timer: setTimeout(() => {
        pending.delete(key);
        onFlush(entry.messages);
      }, BATCH_DEBOUNCE_MS),
    };
    pending.set(key, entry);
  }
}

/** Retorna quantas chaves estão aguardando flush (útil para debug/monitoring). */
export function pendingBatchCount(): number {
  return pending.size;
}
