/**
 * FLUXO 4 - FOLLOW-UP AUTOMÁTICO
 * Equivalente nativo ao Schedule Trigger + lógica JavaScript do n8n.
 *
 * Regras:
 * - 15 min sem resposta + follow_up_count=0  → 1ª mensagem
 * - 1h sem resposta    + follow_up_count=1  → 2ª mensagem
 * - 24h sem resposta   + follow_up_count=2  → 3ª mensagem
 * - Após 3 follow-ups → status = "Follow-up", não envia mais
 *
 * Idempotência: os leads são reivindicados com trava atômica no banco
 * (claimDueFollowUps → RPC claim_due_follow_ups), então execuções simultâneas
 * nunca enviam a mesma mensagem duas vezes. Cada lead sai pela conexão de
 * WhatsApp ativa da organização dona dele (getWhatsAppForOrganization); sem
 * conexão, não envia e loga `whatsapp_not_configured` com o organization_id.
 * Lead que não recebeu a mensagem volta com backoff de 15 min
 * (releaseFollowUpClaim), para não ocupar o lote de toda execução.
 */

import { leadRepository } from '../repositories/lead.repository';
import { resolveLeadOrganizationId } from '../connectors/org-context';
import { ConnectionNotConfiguredError } from '../connectors/types';
import { getWhatsAppForOrganization, type OrgWhatsApp } from '../integrations/whatsapp/org-whatsapp';
import { WorkflowLogger } from '../workflow-engine/workflow.logger';
import { randomUUID } from 'crypto';

const CLAIM_LIMIT = 20;
const DEFAULT_DELAY_MS = 1000;

const FOLLOW_UP_MESSAGES: Record<number, string> = {
  0: 'Opa! Só passando para ver se conseguiu ver minha mensagem 😊',
  1: 'Quando puder, me avisa por aqui que sigo te ajudando 👍',
  2: 'Olá! Fico à disposição quando quiser retomar. Até mais! 👋',
};

export interface FollowUpJobOptions {
  /** Intervalo entre envios, para evitar spam. Padrão: 1000 ms. */
  delayMs?: number;
}

export async function runFollowUpJob(options: FollowUpJobOptions = {}): Promise<void> {
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const logger = new WorkflowLogger('FollowUpJob', randomUUID());
  logger.info('Follow-up job started');

  const leads = await leadRepository.claimDueFollowUps(CLAIM_LIMIT);

  if (leads.length === 0) {
    logger.debug('No leads eligible for follow-up');
    return;
  }

  logger.info(`Claimed ${leads.length} leads for follow-up`);

  // Cache por execução: vários leads da mesma organização resolvem a conexão uma vez.
  // null = organização sem conexão de WhatsApp ativa.
  const whatsappByOrg = new Map<string, Promise<OrgWhatsApp | null>>();
  const whatsappFor = (organizationId: string): Promise<OrgWhatsApp | null> => {
    let cached = whatsappByOrg.get(organizationId);
    if (!cached) {
      cached = getWhatsAppForOrganization(organizationId).catch((err: unknown) => {
        if (err instanceof ConnectionNotConfiguredError) return null;
        whatsappByOrg.delete(organizationId); // erro transitório: tenta de novo no próximo lead
        throw err;
      });
      whatsappByOrg.set(organizationId, cached);
    }
    return cached;
  };

  const release = async (leadId: string): Promise<void> => {
    try {
      await leadRepository.releaseFollowUpClaim(leadId);
    } catch (err) {
      // A trava de 5 min do claim expira sozinha; só registra.
      logger.error('Failed to release follow-up claim', {
        leadId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  for (const lead of leads) {
    let sent = false;

    try {
      if (!lead.whatsapp) {
        logger.warn('Lead has no WhatsApp — skipping', { leadId: lead.id });
        await release(lead.id);
        continue;
      }

      const followUpCount = lead.follow_up_count ?? 0;
      const message = FOLLOW_UP_MESSAGES[followUpCount];

      if (!message) {
        logger.warn('No follow-up message for count', { followUpCount, leadId: lead.id });
        await release(lead.id);
        continue;
      }

      const organizationId = await resolveLeadOrganizationId(lead);
      if (!organizationId) {
        logger.warn('Lead sem organização — follow-up não enviado', {
          leadId: lead.id,
          code: 'lead_without_organization',
        });
        await release(lead.id);
        continue;
      }

      const whatsapp = await whatsappFor(organizationId);
      if (!whatsapp) {
        logger.warn('WhatsApp não configurado para a organização — follow-up não enviado', {
          leadId: lead.id,
          organization_id: organizationId,
          code: 'whatsapp_not_configured',
        });
        await release(lead.id);
        continue;
      }

      const result = await whatsapp.provider.sendText(whatsapp.target, lead.whatsapp, message);

      if (result.success) {
        sent = true;
        await leadRepository.incrementFollowUpCount(lead.id);
        logger.info('Follow-up sent', {
          leadId: lead.id,
          followUpCount: followUpCount + 1,
        });
      } else {
        logger.error('Follow-up send failed', {
          leadId: lead.id,
          organization_id: organizationId,
          code: 'whatsapp_send_failed',
        });
        await release(lead.id);
      }

      // Delay entre disparos para evitar spam
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    } catch (err) {
      logger.error('Follow-up job error for lead', {
        leadId: lead.id,
        error: err instanceof Error ? err.message : String(err),
      });
      // Se a mensagem já saiu, mantém a trava do claim (expira em 5 min) para
      // não reenviar imediatamente; se não saiu, devolve com backoff.
      if (!sent) {
        await release(lead.id);
      }
    }
  }

  logger.info('Follow-up job completed', { processed: leads.length });
}
