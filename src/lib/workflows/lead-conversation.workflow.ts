/**
 * WORKFLOW DE CONVERSA COM LEAD — v2 (Otimizado)
 * Orquestrador principal com error recovery por step, timeouts e resiliência.
 *
 * Fluxo nativo de atendimento: tenant → lead → mídia → agente IA → humanização → envio.
 */

import type { NormalizedMessage } from '../services/message-normalizer.service';
import { isFinalizationCommand } from '../services/tenant-resolver.service';
import type { TenantContext } from '../services/tenant-resolver.service';
import { leadService } from '../services/lead.service';
import { processMessageByType } from '../handlers/message-type.handler';
import { buildAgentContext } from '../services/agent-context-builder.service';
import { conversationRepository } from '../repositories/conversation.repository';
import { executeAIAgent } from '../ai/ai-agent.service';
import { humanizeResponse } from '../services/message-humanizer.service';
import { leadRepository } from '../repositories/lead.repository';
import { WorkflowLogger } from '../workflow-engine/workflow.logger';
import { getWhatsAppForOrganization, type OrgWhatsApp } from '../integrations/whatsapp/org-whatsapp';
import { ConnectionNotConfiguredError } from '../connectors/types';
import { resolveLeadOrganizationId } from '../connectors/org-context';
import { withTimeout } from '../utils/resilience';
import { withOpenAIKey } from '../ai/openai-key-context';
import { randomUUID } from 'crypto';

const STEP_TIMEOUTS = {
  lead: 8_000,
  media: 30_000,
  agent: 60_000,
  humanize: 15_000,
  send: 30_000,
} as const;

/**
 * @param tenant contexto de atendimento já resolvido pelo chamador (webhook:
 *   a partir da organização da conexão autenticada). Nada do payload
 *   (instância, número) escolhe o tenant.
 */
export async function runLeadConversationWorkflow(
  normalized: NormalizedMessage,
  tenant: TenantContext
): Promise<void> {
  const correlationId = randomUUID();
  const logger = new WorkflowLogger('LeadConversation', correlationId);

  logger.info('Workflow started', {
    type: normalized.messageType,
    instance: normalized.instanceName,
  });
  logger.info('Tenant resolved', { userId: tenant.userId });

  // ── STEP 1A: VERIFICAR SE O AGENTE ESTÁ ATIVO ────────────────────────────
  if (!tenant.agentEnabled) {
    logger.info('Agent disabled by tenant — skipping workflow', { userId: tenant.userId });
    return;
  }

  // ── STEP 1B: DEFINIR CHAVE OPENAI DO TENANT ──────────────────────────────
  // withOpenAIKey propaga a chave para todos os serviços OpenAI via AsyncLocalStorage
  // (whisper, vision, pdf, agent, humanizer, embeddings) sem mudar assinaturas.
  const openaiKey = tenant.openaiApiKey || process.env.OPENAI_API_KEY!;
  return withOpenAIKey(openaiKey, () => runWorkflowSteps(normalized, tenant, logger, correlationId));
}

/**
 * Steps 2-10 do workflow, executados dentro do contexto da chave OpenAI do tenant.
 */
async function runWorkflowSteps(
  normalized: NormalizedMessage,
  tenant: TenantContext,
  logger: WorkflowLogger,
  correlationId: string
): Promise<void> {
  // ── STEP 2: COMANDO #FINALIZADO ──────────────────────────────────────────
  if (isFinalizationCommand(normalized.mensagem)) {
    const lead = await leadRepository.findByWhatsApp(normalized.clienteWhatsApp, tenant.userId);
    if (lead) await leadService.returnToBot(lead.id);
    logger.info('#finalizado processed');
    return;
  }

  // ── STEP 3: BUSCAR OU CRIAR LEAD ─────────────────────────────────────────
  const { lead, isNew } = await withTimeout(
    leadService.findOrCreate({
      clienteNome: normalized.clienteNome,
      clienteWhatsApp: normalized.clienteWhatsApp,
      clienteTelefone: normalized.clienteTelefone,
      userId: tenant.userId,
    }),
    STEP_TIMEOUTS.lead,
    'findOrCreate'
  );
  logger.info(isNew ? 'Lead created' : 'Lead found', { leadId: lead.id });

  // ── STEP 3B: DETECTAR MENSAGEM AUTOMÁTICA / BOT ─────────────────────────
  // Detectado = avança estágio, resolve número real de envio, mas NÃO bloqueia.
  // O agente receberá instrução específica para lidar com bots.
  //
  // Caso especial: business account JID (ORG lead) — o bot respondeu de um JID
  // diferente do número que foi prospectado. Precisamos enviar para o número
  // da prospecção original, não para o JID do bot (que pode não existir no WA).
  let sendTargetWhatsApp = normalized.clienteWhatsApp;

  if (normalized.isAutomatedMessage) {
    const reason = normalized.isBusinessAccount ? 'business-jid' : 'bot-pattern';

    if (lead.estagio_pipeline === 'Novo Lead' || !lead.estagio_pipeline) {
      await leadRepository.update(lead.id, {
        estagio_pipeline: 'Contato Inicial',
        data_ultima_interacao: new Date().toISOString(),
      }).catch(() => null);
    }

    // Para business JIDs (ORG leads): busca o lead de prospecção original
    // enviado nos últimos 120min e usa o número DELE para o envio.
    if (normalized.isBusinessAccount && lead.id.startsWith('ORG-')) {
      const prospectionLead = await leadRepository.findRecentProspectionTarget(
        tenant.userId,
        normalized.timestamp,
        120
      ).catch(() => null);

      if (prospectionLead?.whatsapp) {
        sendTargetWhatsApp = prospectionLead.whatsapp;
        logger.info('Business JID — resolved send target to prospection lead', {
          orgLeadId: lead.id,
          prospectionLeadId: prospectionLead.id,
        });
      } else {
        logger.warn('Business JID — no recent prospection lead found, will attempt with original JID', {
          leadId: lead.id,
        });
      }
    }

    logger.info('Bot/automated message — agent will respond with adapted approach', { leadId: lead.id, reason });
  }

  // ── STEP 4: VERIFICAR MODO HUMANO ────────────────────────────────────────
  if (leadService.isInHumanMode(lead)) {
    // Salva a mensagem (consultor pode ver no histórico)
    await conversationRepository.saveLeadMessage({
      lead_id: lead.id,
      message: normalized.mensagem,
      from_lead: true,
      ai_generated: false,
      user_id: tenant.userId,
    }).catch(() => null);

    // Verifica se o consultor está inativo há >= 10min → retoma o bot
    if (leadService.shouldAutoResumeBot(lead)) {
      await leadService.returnToBot(lead.id);
      logger.info('Human mode timeout expired — bot auto-resumed', { leadId: lead.id });
      // Continua o fluxo normalmente com o bot retomando
    } else {
      logger.info('Human mode active — bot skipped');
      return;
    }
  }

  // ── STEP 4B: CONEXÃO DE WHATSAPP DA ORGANIZAÇÃO DO LEAD ─────────────────
  // Mídia e resposta saem pela conexão ativa da organização (Sprint 2b);
  // sem conexão, a mensagem do lead é salva mas o agente não responde.
  const whatsapp = await resolveOrgWhatsApp(lead, logger);

  // ── STEP 5: PROCESSAR MÍDIA ──────────────────────────────────────────────
  const processed = await withTimeout(
    processMessageByType(normalized, whatsapp, normalized.mediaId ?? normalized.messageId),
    STEP_TIMEOUTS.media,
    'processMedia'
  ).catch((err) => {
    logger.warn('Media processing failed — using raw message', { error: err.message });
    return { content: normalized.mensagem || '[Mídia não processada]', messageType: normalized.messageType };
  });

  // ── STEP 6: SALVAR MENSAGEM DO LEAD ──────────────────────────────────────
  await conversationRepository.saveLeadMessage({
    lead_id: lead.id,
    message: processed.content,
    from_lead: true,
    ai_generated: false,
    user_id: tenant.userId,
  }).catch((err) => logger.warn('Save lead message failed', { error: err.message }));

  if (!whatsapp) return;

  // ── STEP 7: MONTAR CONTEXTO + EXECUTAR AGENTE ────────────────────────────
  const agentCtx = await buildAgentContext(normalized, processed, lead, isNew, tenant, normalized.isAutomatedMessage);

  const agentResult = await withTimeout(
    executeAIAgent(agentCtx),
    STEP_TIMEOUTS.agent,
    'executeAIAgent'
  ).catch((err) => {
    logger.error('AI Agent failed', { error: err.message });
    return null;
  });

  if (!agentResult?.output?.trim()) {
    logger.warn('AI Agent returned empty — aborting send');
    return;
  }

  logger.info('Agent responded', {
    tools: agentResult.toolCalls,
    iterations: agentResult.iterations,
  });

  // ── STEP 8: HUMANIZAR ────────────────────────────────────────────────────
  const messages = await withTimeout(
    humanizeResponse(agentResult.output),
    STEP_TIMEOUTS.humanize,
    'humanize'
  ).catch(() => [agentResult.output]); // Fallback: envia sem humanizar

  // ── STEP 8B: HUMANIZAÇÃO — read receipt + typing indicator ──────────────
  // markAsRead e sendTyping são fire-and-forget: não bloqueiam o envio.
  // A Evolution API gerencia o delay do typing internamente via o param `delay`.
  // Remover os await setTimeout reduz o tempo de resposta de 15-70s → 5-20s,
  // evitando timeout da Evolution API (≈10s) que causava webhooks não respondidos.
  const { provider, target } = whatsapp;
  const totalChars = messages.map(m => m.length).reduce((a, b) => a + b, 0);
  const typingMs = Math.min(Math.max(Math.round(totalChars / 4.5 * 1000), 3000), 12000);

  provider.markAsRead(target, normalized.clienteWhatsApp, normalized.messageId ?? '').catch(() => {});
  provider.sendTyping(target, sendTargetWhatsApp, typingMs).catch(() => {});

  // ── STEP 9: ENVIAR VIA WHATSAPP PROVIDER ────────────────────────────────
  // Princípio: se o lead recebeu a msg de prospecção, ele TEM um número válido.
  // Tentativa 1: envia para sendTargetWhatsApp (número já resolvido ou JID original).
  // Fallback:    se falhar E ainda não usamos o número da prospecção,
  //              busca o lead prospectado que recebeu a msg e tenta de novo.
  let sentCount = 0;

  const firstAttempt = await withTimeout(
    provider.sendMessageSequence(target, sendTargetWhatsApp, messages, 3000),
    STEP_TIMEOUTS.send,
    'sendMessages'
  ).catch((err) => {
    logger.error('Send messages failed (attempt 1)', { error: err.message, code: 'whatsapp_send_failed' });
    return { sent: 0, failed: messages.length };
  });

  sentCount = firstAttempt.sent;

  // Fallback: tentativa falhou e o número ainda não foi resolvido via prospecção
  if (sentCount === 0 && sendTargetWhatsApp === normalized.clienteWhatsApp) {
    logger.warn('Send failed — looking up original prospection number as fallback', { leadId: lead.id });

    const prospectionLead = await leadRepository.findRecentProspectionTarget(
      tenant.userId,
      normalized.timestamp,
      120
    ).catch(() => null);

    if (prospectionLead?.whatsapp && prospectionLead.whatsapp !== sendTargetWhatsApp) {
      logger.info('Fallback: retrying with prospection lead number', {
        prospectionLeadId: prospectionLead.id,
      });

      const fallbackAttempt = await withTimeout(
        provider.sendMessageSequence(target, prospectionLead.whatsapp, messages, 3000),
        STEP_TIMEOUTS.send,
        'sendMessages-fallback'
      ).catch((err) => {
        logger.error('Send messages failed (fallback)', { error: err.message, code: 'whatsapp_send_failed' });
        return { sent: 0, failed: messages.length };
      });

      sentCount = fallbackAttempt.sent;
    } else {
      logger.warn('Fallback: no valid prospection lead found within 2h window', { leadId: lead.id });
    }
  }

  // ── STEP 10: PERSISTIR RESPOSTA ──────────────────────────────────────────
  const sent = sentCount;
  if (sent > 0) {
    await Promise.all([
      conversationRepository.saveAgentResponse(lead.id, agentResult.output, tenant.userId),
      leadRepository.update(lead.id, { data_ultima_interacao: new Date().toISOString() }),
    ]).catch((err) => logger.warn('Persist response failed', { error: err.message }));
  }

  logger.info('Workflow completed', { sent, correlationId });
}

/**
 * Conexão de WhatsApp da organização do lead (organization_id, ou a do dono
 * quando nulo). Sem conexão ativa → null + log `whatsapp_not_configured`.
 */
async function resolveOrgWhatsApp(
  lead: { id: string; organization_id?: string | null; user_id?: string | null },
  logger: WorkflowLogger
): Promise<OrgWhatsApp | null> {
  const organizationId = await resolveLeadOrganizationId(lead).catch(() => null);
  if (!organizationId) {
    logger.warn('Lead sem organização — resposta não enviada', {
      leadId: lead.id,
      code: 'lead_without_organization',
    });
    return null;
  }
  try {
    return await getWhatsAppForOrganization(organizationId);
  } catch (err) {
    logger.warn('WhatsApp indisponível para a organização — resposta não enviada', {
      leadId: lead.id,
      organization_id: organizationId,
      code: err instanceof ConnectionNotConfiguredError ? 'whatsapp_not_configured' : 'whatsapp_connection_error',
    });
    return null;
  }
}
