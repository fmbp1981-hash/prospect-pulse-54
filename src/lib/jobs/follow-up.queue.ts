/**
 * FOLLOW-UP POR FILA (Cloudflare Queue `FOLLOW_UP_QUEUE`)
 *
 * O cron de 1 min só reivindica os leads vencidos (claim com trava de ~5 min no
 * banco) e despacha uma mensagem por lead. O consumidor da fila chama
 * POST /api/internal/follow-up/process, que processa o lote aqui
 * (processFollowUpBatch): relê o lead, confere que ele continua vencido,
 * reserva o envio no banco e envia pela conexão de WhatsApp da organização.
 *
 * Política (entrega at-least-once; nunca duplicar um WhatsApp):
 * - falha clara do provedor (`success === false`) → desfaz a reserva, 'retry'
 * - falha ambígua (sendText lança: timeout/rede) → mantém a reserva, 'skipped'
 *   (pode perder um follow-up, nunca envia duas vezes)
 * - última entrega (attempts > FOLLOW_UP_MAX_RETRIES) que seria 'retry' →
 *   libera o claim (backoff) e 'skipped': o consumidor dá ack e a DLQ só
 *   recebe falhas de transporte
 * - 1000 ms entre envios dentro de uma chamada (FOLLOW_UP_SEND_DELAY_MS)
 */

import { randomUUID } from 'crypto';
import { leadRepository } from '../repositories/lead.repository';
import { WorkflowLogger } from '../workflow-engine/workflow.logger';
import { errorCode } from '../runtime/error-code';
import { createWhatsAppResolver, FOLLOW_UP_SEND_DELAY_MS, prepareFollowUp } from './follow-up.job';
import {
  FOLLOW_UP_DUE_STATUSES,
  FOLLOW_UP_MAX_RETRIES,
  type FollowUpOutcome,
  type FollowUpQueue,
  type ProcessMessage,
  type ProcessResult,
} from './follow-up.contract';

/** O que uma entrega da fila carrega para o processamento. */
type FollowUpDelivery = Pick<ProcessMessage, 'leadId' | 'followUpCount' | 'attempts'>;

/**
 * Janelas sem interação por follow_up_count — as mesmas da RPC
 * claim_due_follow_ups (supabase/migrations/20261030110000_follow_up_claim.sql).
 */
export const FOLLOW_UP_THRESHOLDS_MINUTES: Readonly<Record<number, number>> = {
  0: 15,
  1: 60,
  2: 1440,
};

/**
 * O lead ainda está vencido para follow-up no momento do consumo? Mesmas
 * condições da RPC de claim: modo bot, status em conversa e última interação
 * mais antiga que a janela do contador atual.
 */
export function isStillDueForFollowUp(
  lead: {
    modo_atendimento: string | null;
    status_msg_wa: string | null;
    follow_up_count: number | null;
    data_ultima_interacao: string | null;
  },
  now: Date
): boolean {
  if (lead.modo_atendimento !== 'bot') return false;
  if (!lead.status_msg_wa || !FOLLOW_UP_DUE_STATUSES.includes(lead.status_msg_wa)) return false;

  const thresholdMinutes = FOLLOW_UP_THRESHOLDS_MINUTES[lead.follow_up_count ?? 0];
  if (thresholdMinutes === undefined || !lead.data_ultima_interacao) return false;

  const lastInteraction = new Date(lead.data_ultima_interacao).getTime();
  if (Number.isNaN(lastInteraction)) return false;
  return lastInteraction <= now.getTime() - thresholdMinutes * 60_000;
}

/** Máximo de mensagens por sendBatch no Cloudflare Queues. */
const DEFAULT_DISPATCH_LIMIT = 100;

/**
 * Reivindica os leads vencidos e publica uma mensagem por lead num único
 * sendBatch. Se a publicação falhar, devolve todos os claims e relança.
 */
export async function dispatchDueFollowUps(
  queue: FollowUpQueue,
  limit = DEFAULT_DISPATCH_LIMIT
): Promise<number> {
  const leads = await leadRepository.claimDueFollowUps(limit);
  if (leads.length === 0) return 0;

  const messages = leads.map((lead) => ({
    body: { leadId: lead.id, followUpCount: lead.follow_up_count ?? 0 },
  }));

  try {
    await queue.sendBatch(messages);
  } catch (err) {
    // Sem publicação, ninguém vai processar: libera os claims para o próximo ciclo.
    const releases = await Promise.allSettled(
      leads.map((lead) => leadRepository.releaseFollowUpClaim(lead.id))
    );
    releases.forEach((r, i) => {
      if (r.status === 'rejected') {
        // A trava de 5 min do claim expira sozinha; só registra.
        console.error('[FollowUp/Dispatch] falha ao liberar claim', {
          leadId: leads[i].id,
          error: errorCode(r.reason),
        });
      }
    });
    throw err;
  }

  return leads.length;
}

/** Resultado interno: o outcome e se a mensagem chegou a ir ao provedor. */
interface ProcessDetail {
  outcome: FollowUpOutcome;
  sendAttempted: boolean;
}

async function releaseClaimOnLastDelivery(leadId: string, logger: WorkflowLogger): Promise<void> {
  try {
    await leadRepository.releaseFollowUpClaim(leadId);
  } catch (err) {
    // A trava de 5 min do claim expira sozinha; só registra.
    logger.error('Falha ao liberar claim na última entrega', { leadId, error: errorCode(err) });
  }
}

/**
 * Uma tentativa de processar a mensagem (sem a política de última entrega).
 * - lead inexistente, follow_up_count diferente do da mensagem ou lead que não
 *   está mais vencido (respondeu, foi para humano, mudou de status) → 'skipped',
 *   sem liberar o claim e sem enviar
 * - sem WhatsApp, sem organização ou sem conexão → libera o claim, 'skipped'
 * - reserva o envio (update condicional) ANTES de enviar; reserva negada
 *   (outra entrega já enviou ou o lead mudou) → 'skipped'
 * - envio ok → 'sent' (o contador já foi avançado pela reserva)
 * - `success === false` → desfaz a reserva e 'retry'
 * - sendText lança (resultado ambíguo) → mantém a reserva e 'skipped'
 */
async function processOnce(msg: FollowUpDelivery, logger: WorkflowLogger): Promise<ProcessDetail> {
  try {
    const lead = await leadRepository.findByIdForFollowUpJob(msg.leadId);
    if (!lead) {
      logger.warn('Lead da mensagem de follow-up não existe — ignorada', { leadId: msg.leadId });
      return { outcome: 'skipped', sendAttempted: false };
    }

    if ((lead.follow_up_count ?? 0) !== msg.followUpCount) {
      logger.info('follow_up_count já avançou — mensagem ignorada', {
        leadId: msg.leadId,
        expected: msg.followUpCount,
        actual: lead.follow_up_count,
      });
      return { outcome: 'skipped', sendAttempted: false };
    }

    const now = new Date();
    if (!isStillDueForFollowUp(lead, now) || !lead.data_ultima_interacao) {
      logger.info('Lead não está mais vencido para follow-up — mensagem ignorada', {
        leadId: msg.leadId,
      });
      return { outcome: 'skipped', sendAttempted: false };
    }

    const prepared = await prepareFollowUp(lead, createWhatsAppResolver(), logger);
    if (prepared.kind === 'released') return { outcome: 'skipped', sendAttempted: false };

    const reserved = await leadRepository.reserveFollowUpSend(
      lead.id,
      msg.followUpCount,
      lead.data_ultima_interacao,
      now
    );
    if (!reserved) {
      logger.info('Reserva do follow-up negada (já enviado ou lead mudou)', { leadId: lead.id });
      return { outcome: 'skipped', sendAttempted: false };
    }

    let success: boolean;
    try {
      const result = await prepared.whatsapp.provider.sendText(
        prepared.whatsapp.target,
        prepared.phone,
        prepared.message
      );
      success = result.success === true;
    } catch (err) {
      // Timeout/rede: a mensagem pode ter saído. Mantém a reserva para nunca
      // reenviar (prefere perder um follow-up a duplicar um WhatsApp).
      logger.error('Envio de follow-up com resultado ambíguo — reserva mantida, sem reenvio', {
        leadId: lead.id,
        organization_id: prepared.organizationId,
        code: 'whatsapp_send_ambiguous',
        error: errorCode(err),
      });
      return { outcome: 'skipped', sendAttempted: true };
    }

    if (success) {
      logger.info('Follow-up sent', { leadId: lead.id, followUpCount: msg.followUpCount + 1 });
      return { outcome: 'sent', sendAttempted: true };
    }

    logger.error('Follow-up send failed', {
      leadId: lead.id,
      organization_id: prepared.organizationId,
      code: 'whatsapp_send_failed',
    });

    try {
      const reverted = await leadRepository.revertFollowUpReservation(lead.id, msg.followUpCount, {
        reservedAt: now,
        status_msg_wa: lead.status_msg_wa,
        data_ultima_interacao: lead.data_ultima_interacao,
      });
      if (!reverted) {
        logger.warn('Reserva do follow-up não revertida (lead mudou após a reserva)', { leadId: lead.id });
      }
    } catch (err) {
      logger.error('Falha ao reverter reserva do follow-up', { leadId: lead.id, error: errorCode(err) });
    }
    return { outcome: 'retry', sendAttempted: true };
  } catch (err) {
    // erro transitório antes do envio (banco, resolução de conexão)
    logger.error('Erro ao processar mensagem de follow-up', { leadId: msg.leadId, error: errorCode(err) });
    return { outcome: 'retry', sendAttempted: false };
  }
}

async function processWithPolicy(msg: FollowUpDelivery, logger: WorkflowLogger): Promise<ProcessDetail> {
  const detail = await processOnce(msg, logger);
  if (detail.outcome === 'retry' && msg.attempts > FOLLOW_UP_MAX_RETRIES) {
    // Última entrega: devolve o lead ao cron (backoff) e dá ack, em vez de
    // mandar para a DLQ uma falha de envio/banco que o próximo ciclo resolve.
    await releaseClaimOnLastDelivery(msg.leadId, logger);
    logger.warn('Última entrega do follow-up sem sucesso — claim liberado', { leadId: msg.leadId });
    return { outcome: 'skipped', sendAttempted: detail.sendAttempted };
  }
  return detail;
}

/** Processa uma mensagem da fila, já com a política de última entrega. */
export async function processFollowUpMessage(msg: FollowUpDelivery): Promise<FollowUpOutcome> {
  const logger = new WorkflowLogger('FollowUpQueue', randomUUID());
  const { outcome } = await processWithPolicy(msg, logger);
  return outcome;
}

export interface FollowUpBatchOptions {
  /** Intervalo entre envios. Padrão: FOLLOW_UP_SEND_DELAY_MS (1000 ms). */
  delayMs?: number;
  /** Injetável para testes. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Processa o lote da rota interna em sequência (evita rajada pela mesma
 * conexão de WhatsApp), esperando `delayMs` antes do próximo item sempre que o
 * anterior chegou ao provedor.
 */
export async function processFollowUpBatch(
  messages: readonly ProcessMessage[],
  options: FollowUpBatchOptions = {}
): Promise<ProcessResult[]> {
  const delayMs = options.delayMs ?? FOLLOW_UP_SEND_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;
  const logger = new WorkflowLogger('FollowUpQueue', randomUUID());
  const results: ProcessResult[] = [];

  let pendingDelay = false;
  for (const msg of messages) {
    if (pendingDelay && delayMs > 0) await sleep(delayMs);
    const detail = await processWithPolicy(msg, logger);
    pendingDelay = detail.sendAttempted;
    results.push({ id: msg.id, outcome: detail.outcome });
  }

  return results;
}
