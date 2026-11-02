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

import { leadRepository, type FollowUpJobLead } from '../repositories/lead.repository';
import { resolveLeadOrganizationId } from '../connectors/org-context';
import { ConnectionNotConfiguredError } from '../connectors/types';
import { getWhatsAppForOrganization, type OrgWhatsApp } from '../integrations/whatsapp/org-whatsapp';
import { WorkflowLogger } from '../workflow-engine/workflow.logger';
import { randomUUID } from 'crypto';
import type { Database } from '@/integrations/supabase/types';

const CLAIM_LIMIT = 20;
/** Intervalo entre envios de follow-up (job direto e rota da fila). */
export const FOLLOW_UP_SEND_DELAY_MS = 1000;

const FOLLOW_UP_MESSAGES: Record<number, string> = {
  0: 'Opa! Só passando para ver se conseguiu ver minha mensagem 😊',
  1: 'Quando puder, me avisa por aqui que sigo te ajudando 👍',
  2: 'Olá! Fico à disposição quando quiser retomar. Até mais! 👋',
};

type LeadRow = Database['public']['Tables']['leads_prospeccao']['Row'];

/** Resultado do envio de um follow-up para um lead. */
export type SendFollowUpResult =
  /** mensagem enviada (contador incrementado, ou trava mantida se o incremento falhou) */
  | 'sent'
  /** não há o que enviar agora (sem WhatsApp, sem organização, sem conexão): trava liberada */
  | 'released'
  /** envio falhou ou deu erro; a trava continua — quem chamou decide se libera */
  | 'failed';

export type WhatsAppResolver = (organizationId: string) => Promise<OrgWhatsApp | null>;

/**
 * Resolve a conexão de WhatsApp por organização com cache (por execução/lote).
 * null = organização sem conexão de WhatsApp ativa.
 */
export function createWhatsAppResolver(): WhatsAppResolver {
  const whatsappByOrg = new Map<string, Promise<OrgWhatsApp | null>>();
  return (organizationId: string): Promise<OrgWhatsApp | null> => {
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
}

async function releaseClaim(leadId: string, logger: WorkflowLogger): Promise<void> {
  try {
    await leadRepository.releaseFollowUpClaim(leadId);
  } catch (err) {
    // A trava de 5 min do claim expira sozinha; só registra.
    logger.error('Failed to release follow-up claim', {
      leadId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Lead pronto para envio: mensagem, organização e conexão resolvidas. */
export interface PreparedFollowUp {
  kind: 'ready';
  phone: string;
  message: string;
  followUpCount: number;
  organizationId: string;
  whatsapp: OrgWhatsApp;
}

/**
 * Resolve o que é preciso para enviar o follow-up de um lead já reivindicado.
 * Sem WhatsApp, sem mensagem para o contador, sem organização ou sem conexão:
 * libera o claim (backoff) e devolve `{ kind: 'released' }`.
 * Pode lançar em erro transitório (resolução de organização/conexão).
 */
export async function prepareFollowUp(
  lead: FollowUpJobLead,
  whatsappFor: WhatsAppResolver,
  logger: WorkflowLogger
): Promise<PreparedFollowUp | { kind: 'released' }> {
  if (!lead.whatsapp) {
    logger.warn('Lead has no WhatsApp — skipping', { leadId: lead.id });
    await releaseClaim(lead.id, logger);
    return { kind: 'released' };
  }

  const followUpCount = lead.follow_up_count ?? 0;
  const message = FOLLOW_UP_MESSAGES[followUpCount];

  if (!message) {
    logger.warn('No follow-up message for count', { followUpCount, leadId: lead.id });
    await releaseClaim(lead.id, logger);
    return { kind: 'released' };
  }

  const organizationId = await resolveLeadOrganizationId(lead);
  if (!organizationId) {
    logger.warn('Lead sem organização — follow-up não enviado', {
      leadId: lead.id,
      code: 'lead_without_organization',
    });
    await releaseClaim(lead.id, logger);
    return { kind: 'released' };
  }

  const whatsapp = await whatsappFor(organizationId);
  if (!whatsapp) {
    logger.warn('WhatsApp não configurado para a organização — follow-up não enviado', {
      leadId: lead.id,
      organization_id: organizationId,
      code: 'whatsapp_not_configured',
    });
    await releaseClaim(lead.id, logger);
    return { kind: 'released' };
  }

  return { kind: 'ready', phone: lead.whatsapp, message, followUpCount, organizationId, whatsapp };
}

/**
 * Envia o follow-up de um lead já reivindicado (caminho do cron direto,
 * runFollowUpJob): prepara, envia e incrementa o contador no sucesso.
 * Nunca lança: erros viram 'failed' (antes do envio) ou 'sent' (se a mensagem
 * já saiu e só o incremento falhou — a trava é mantida para não reenviar).
 */
export async function sendFollowUpToLead(
  lead: LeadRow,
  whatsappFor: WhatsAppResolver,
  logger: WorkflowLogger = new WorkflowLogger('FollowUp', randomUUID())
): Promise<SendFollowUpResult> {
  let sent = false;

  try {
    const prepared = await prepareFollowUp(lead, whatsappFor, logger);
    if (prepared.kind === 'released') return 'released';

    const { whatsapp, phone, message, followUpCount, organizationId } = prepared;
    const result = await whatsapp.provider.sendText(whatsapp.target, phone, message);

    if (!result.success) {
      logger.error('Follow-up send failed', {
        leadId: lead.id,
        organization_id: organizationId,
        code: 'whatsapp_send_failed',
      });
      return 'failed';
    }

    sent = true;
    await leadRepository.incrementFollowUpCount(lead.id);
    logger.info('Follow-up sent', {
      leadId: lead.id,
      followUpCount: followUpCount + 1,
    });
    return 'sent';
  } catch (err) {
    logger.error('Follow-up job error for lead', {
      leadId: lead.id,
      error: err instanceof Error ? err.message : String(err),
    });
    // Se a mensagem já saiu, mantém a trava do claim (expira em 5 min) para
    // não reenviar imediatamente.
    return sent ? 'sent' : 'failed';
  }
}

export interface FollowUpJobOptions {
  /** Intervalo entre envios, para evitar spam. Padrão: 1000 ms. */
  delayMs?: number;
}

export async function runFollowUpJob(options: FollowUpJobOptions = {}): Promise<void> {
  const delayMs = options.delayMs ?? FOLLOW_UP_SEND_DELAY_MS;
  const logger = new WorkflowLogger('FollowUpJob', randomUUID());
  logger.info('Follow-up job started');

  const leads = await leadRepository.claimDueFollowUps(CLAIM_LIMIT);

  if (leads.length === 0) {
    logger.debug('No leads eligible for follow-up');
    return;
  }

  logger.info(`Claimed ${leads.length} leads for follow-up`);

  // Cache por execução: vários leads da mesma organização resolvem a conexão uma vez.
  const whatsappFor = createWhatsAppResolver();

  for (const lead of leads) {
    const outcome = await sendFollowUpToLead(lead, whatsappFor, logger);

    // Lead que não recebeu a mensagem volta com backoff de 15 min.
    if (outcome === 'failed') {
      await releaseClaim(lead.id, logger);
    }

    // Delay entre disparos para evitar spam
    if (outcome !== 'released' && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  logger.info('Follow-up job completed', { processed: leads.length });
}
