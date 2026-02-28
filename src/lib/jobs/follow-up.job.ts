/**
 * FLUXO 4 - FOLLOW-UP AUTOMÁTICO
 * Equivalente nativo ao Schedule Trigger + lógica JavaScript do n8n.
 *
 * Regras (idênticas ao n8n):
 * - 10 min sem resposta + follow_up_count=0  → 1ª mensagem
 * - 1h sem resposta   + follow_up_count=1  → 2ª mensagem
 * - 24h sem resposta  + follow_up_count=2  → 3ª mensagem
 * - Após 3 follow-ups → status = "Follow-up", não envia mais
 */

import { leadRepository } from '../repositories/lead.repository';
import { sendWhatsAppText } from '../integrations/evolution/messaging.client';
import { WorkflowLogger } from '../workflow-engine/workflow.logger';
import { randomUUID } from 'crypto';

// Instância Evolution padrão (configurável por lead/tenant em produção)
const DEFAULT_INSTANCE = process.env.EVOLUTION_DEFAULT_INSTANCE!;

const FOLLOW_UP_MESSAGES: Record<number, string> = {
  0: 'Opa! Só passando para ver se conseguiu ver minha mensagem 😊',
  1: 'Quando puder, me avisa por aqui que sigo te ajudando 👍',
  2: 'Olá! Fico à disposição quando quiser retomar. Até mais! 👋',
};

export async function runFollowUpJob(): Promise<void> {
  const logger = new WorkflowLogger('FollowUpJob', randomUUID());
  logger.info('Follow-up job started');

  const leads = await leadRepository.findLeadsForFollowUp();

  if (leads.length === 0) {
    logger.debug('No leads eligible for follow-up');
    return;
  }

  logger.info(`Found ${leads.length} leads for follow-up`);

  for (const lead of leads) {
    if (!lead.whatsapp) {
      logger.warn('Lead has no WhatsApp — skipping', { leadId: lead.id });
      continue;
    }

    const followUpCount = (lead.follow_up_count as number) ?? 0;
    const message = FOLLOW_UP_MESSAGES[followUpCount];

    if (!message) {
      logger.warn('No follow-up message for count', { followUpCount, leadId: lead.id });
      continue;
    }

    try {
      const result = await sendWhatsAppText({
        instanceName: DEFAULT_INSTANCE,
        to: lead.whatsapp,
        text: message,
      });

      if (result.success) {
        await leadRepository.incrementFollowUpCount(lead.id);
        logger.info('Follow-up sent', {
          leadId: lead.id,
          followUpCount: followUpCount + 1,
        });
      } else {
        logger.error('Follow-up send failed', { leadId: lead.id, error: result.error });
      }

      // Delay entre disparos para evitar spam
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      logger.error('Follow-up job error for lead', {
        leadId: lead.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info('Follow-up job completed', { processed: leads.length });
}
