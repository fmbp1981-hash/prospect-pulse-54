/**
 * FOLLOW-UP POR FILA (Cloudflare Queue `FOLLOW_UP_QUEUE`)
 *
 * O cron de 1 min só reivindica os leads vencidos (claim com trava de ~5 min no
 * banco) e despacha uma mensagem por lead. O consumidor da fila chama
 * POST /api/internal/follow-up/process, que processa cada mensagem aqui:
 * relê o lead, confere que o follow_up_count não avançou (mensagem repetida
 * ou atrasada) e envia pela conexão de WhatsApp da organização.
 */

import { randomUUID } from 'crypto';
import { leadRepository } from '../repositories/lead.repository';
import { WorkflowLogger } from '../workflow-engine/workflow.logger';
import { createWhatsAppResolver, prepareFollowUp } from './follow-up.job';

export type FollowUpMessage = { leadId: string; followUpCount: number };

/** Formato estrutural do binding de Queue do Cloudflare (só o que usamos). */
export interface FollowUpQueue {
  sendBatch(messages: { body: FollowUpMessage }[]): Promise<void>;
}

export type FollowUpOutcome = 'sent' | 'skipped' | 'retry';

/**
 * max_retries do consumidor da fila. O Cloudflare começa `attempts` em 1, então
 * há FOLLOW_UP_MAX_RETRIES + 1 entregas; a última é `attempts > FOLLOW_UP_MAX_RETRIES`.
 */
export const FOLLOW_UP_MAX_RETRIES = 3;

/**
 * Janelas sem interação por follow_up_count — as mesmas da RPC
 * claim_due_follow_ups (supabase/migrations/20261030110000_follow_up_claim.sql).
 */
export const FOLLOW_UP_THRESHOLDS_MINUTES: Readonly<Record<number, number>> = {
  0: 15,
  1: 60,
  2: 1440,
};

const DUE_STATUSES: readonly string[] = ['Em Conversa', 'Qualificando'];

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
  if (!lead.status_msg_wa || !DUE_STATUSES.includes(lead.status_msg_wa)) return false;

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
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    });
    throw err;
  }

  return leads.length;
}

/**
 * Processa uma mensagem da fila.
 * - lead inexistente, follow_up_count diferente do da mensagem ou lead que não
 *   está mais vencido (respondeu, foi para humano, mudou de status) → 'skipped',
 *   sem liberar o claim e sem enviar
 * - sem WhatsApp, sem organização ou sem conexão → libera o claim, 'skipped'
 * - reserva o envio (update condicional do contador) ANTES de enviar; reserva
 *   negada (outra entrega já enviou) → 'skipped'
 * - envio ok → 'sent' (o contador já foi avançado pela reserva)
 * - falha de envio → desfaz a reserva e devolve 'retry' (a trava do claim
 *   segura o lead enquanto a fila tenta de novo)
 */
export async function processFollowUpMessage(msg: FollowUpMessage): Promise<FollowUpOutcome> {
  const logger = new WorkflowLogger('FollowUpQueue', randomUUID());

  try {
    const lead = await leadRepository.findById(msg.leadId);
    if (!lead) {
      logger.warn('Lead da mensagem de follow-up não existe — ignorada', { leadId: msg.leadId });
      return 'skipped';
    }

    if ((lead.follow_up_count ?? 0) !== msg.followUpCount) {
      logger.info('follow_up_count já avançou — mensagem ignorada', {
        leadId: msg.leadId,
        expected: msg.followUpCount,
        actual: lead.follow_up_count,
      });
      return 'skipped';
    }

    const now = new Date();
    if (!isStillDueForFollowUp(lead, now)) {
      logger.info('Lead não está mais vencido para follow-up — mensagem ignorada', {
        leadId: msg.leadId,
      });
      return 'skipped';
    }

    const prepared = await prepareFollowUp(lead, createWhatsAppResolver(), logger);
    if (prepared.kind === 'released') return 'skipped';

    const reserved = await leadRepository.reserveFollowUpSend(lead.id, msg.followUpCount, now);
    if (!reserved) {
      logger.info('Reserva do follow-up negada (já enviado por outra entrega)', { leadId: lead.id });
      return 'skipped';
    }

    let sendError: string | null = null;
    try {
      const result = await prepared.whatsapp.provider.sendText(
        prepared.whatsapp.target,
        prepared.phone,
        prepared.message
      );
      if (result.success) {
        logger.info('Follow-up sent', { leadId: lead.id, followUpCount: msg.followUpCount + 1 });
        return 'sent';
      }
      sendError = 'whatsapp_send_failed';
    } catch (err) {
      sendError = err instanceof Error ? err.message : String(err);
    }

    logger.error('Follow-up send failed', {
      leadId: lead.id,
      organization_id: prepared.organizationId,
      code: 'whatsapp_send_failed',
      error: sendError,
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
      logger.error('Falha ao reverter reserva do follow-up', {
        leadId: lead.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return 'retry';
  } catch (err) {
    // erro transitório antes do envio (banco, resolução de conexão)
    logger.error('Erro ao processar mensagem de follow-up', {
      leadId: msg.leadId,
      error: err instanceof Error ? err.message : String(err),
    });
    return 'retry';
  }
}
