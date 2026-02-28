/**
 * FLUXO 5 - DISPARO EM MASSA (PROSPECÇÃO)
 * Equivalente nativo ao "Loop Over Items + Enviar texto2 + Wait (10s)" do n8n.
 * Envia mensagens em sequência com rate limiting.
 */

import { sendWhatsAppText } from '../integrations/evolution/messaging.client';
import { WorkflowLogger } from '../workflow-engine/workflow.logger';
import { randomUUID } from 'crypto';

interface BulkJob {
  messages: Array<{ whatsapp: string; message: string }>;
  instanceName: string;
  delayMs: number; // default: 10000ms (10s) — igual ao n8n
}

interface BulkJobResult {
  jobId: string;
  total: number;
  sent: number;
  failed: number;
  errors: Array<{ whatsapp: string; error: string }>;
}

// Fila simples em memória (em produção: substituir por Bull/BullMQ + Redis)
const activeJobs = new Map<string, Promise<BulkJobResult>>();

export const bulkSender = {
  /**
   * Enfileira um job de disparo em massa.
   * Retorna jobId para acompanhamento.
   */
  enqueue(job: BulkJob): Promise<string> {
    const jobId = randomUUID();

    const jobPromise = runBulkJob(jobId, job);
    activeJobs.set(jobId, jobPromise);

    // Limpa da fila quando terminar
    jobPromise.finally(() => {
      setTimeout(() => activeJobs.delete(jobId), 60000);
    });

    return Promise.resolve(jobId);
  },

  /**
   * Aguarda conclusão de um job (para testes).
   */
  await(jobId: string): Promise<BulkJobResult> | undefined {
    return activeJobs.get(jobId);
  },
};

async function runBulkJob(jobId: string, job: BulkJob): Promise<BulkJobResult> {
  const logger = new WorkflowLogger('BulkSender', jobId);
  logger.info('Bulk job started', { total: job.messages.length, instance: job.instanceName });

  const result: BulkJobResult = {
    jobId,
    total: job.messages.length,
    sent: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < job.messages.length; i++) {
    const { whatsapp, message } = job.messages[i];

    try {
      const sendResult = await sendWhatsAppText({
        instanceName: job.instanceName,
        to: whatsapp,
        text: message,
      });

      if (sendResult.success) {
        result.sent++;
        logger.info(`Sent ${i + 1}/${job.messages.length}`, { to: whatsapp });
      } else {
        result.failed++;
        result.errors.push({ whatsapp, error: sendResult.error ?? 'Unknown' });
        logger.warn('Send failed', { to: whatsapp, error: sendResult.error });
      }
    } catch (err) {
      result.failed++;
      const errorMsg = err instanceof Error ? err.message : String(err);
      result.errors.push({ whatsapp, error: errorMsg });
      logger.error('Send error', { to: whatsapp, error: errorMsg });
    }

    // Delay entre mensagens (10s — igual ao n8n Wait)
    if (i < job.messages.length - 1 && job.delayMs > 0) {
      await new Promise((r) => setTimeout(r, job.delayMs));
    }
  }

  logger.info('Bulk job completed', {
    sent: result.sent,
    failed: result.failed,
  });

  return result;
}
