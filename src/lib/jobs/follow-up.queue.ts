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
import { createWhatsAppResolver, sendFollowUpToLead } from './follow-up.job';

export type FollowUpMessage = { leadId: string; followUpCount: number };

/** Formato estrutural do binding de Queue do Cloudflare (só o que usamos). */
export interface FollowUpQueue {
  sendBatch(messages: { body: FollowUpMessage }[]): Promise<void>;
}

export type FollowUpOutcome = 'sent' | 'skipped' | 'retry';

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
    await Promise.allSettled(leads.map((lead) => leadRepository.releaseFollowUpClaim(lead.id)));
    throw err;
  }

  return leads.length;
}

/**
 * Processa uma mensagem da fila.
 * - lead inexistente ou follow_up_count diferente do da mensagem → 'skipped'
 * - sem WhatsApp, sem organização ou sem conexão → libera o claim, 'skipped'
 * - envio ok → incrementa, 'sent'
 * - falha de envio → 'retry' (a trava do claim segura o lead enquanto a fila tenta de novo)
 */
export async function processFollowUpMessage(msg: FollowUpMessage): Promise<FollowUpOutcome> {
  const logger = new WorkflowLogger('FollowUpQueue', randomUUID());

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

  const result = await sendFollowUpToLead(lead, createWhatsAppResolver(), logger);
  if (result === 'sent') return 'sent';
  if (result === 'released') return 'skipped';
  return 'retry';
}
