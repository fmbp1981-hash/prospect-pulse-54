/**
 * WORKFLOW XPAG LEAD HANDLER — v2 (Otimizado)
 * Orquestrador principal com error recovery por step, timeouts e resiliência.
 *
 * Substitui integralmente o workflow n8n "Xpag_Buscar_ou_Criar_Lead" v3.4.
 */

import type { NormalizedMessage } from '../services/message-normalizer.service';
import { resolveTenantByInstance, isFinalizationCommand } from '../services/tenant-resolver.service';
import { leadService } from '../services/lead.service';
import { processMessageByType } from '../handlers/message-type.handler';
import { buildAgentContext } from '../services/agent-context-builder.service';
import { conversationRepository } from '../repositories/conversation.repository';
import { executeAIAgent } from '../ai/ai-agent.service';
import { humanizeResponse } from '../services/message-humanizer.service';
import { leadRepository } from '../repositories/lead.repository';
import { WorkflowLogger } from '../workflow-engine/workflow.logger';
import { getWhatsAppProvider } from '../integrations/whatsapp/whatsapp.factory';
import { withTimeout } from '../utils/resilience';
import { randomUUID } from 'crypto';

const STEP_TIMEOUTS = {
  tenant: 5_000,
  lead: 8_000,
  media: 30_000,
  agent: 60_000,
  humanize: 15_000,
  send: 30_000,
} as const;

export async function runXpagWorkflow(normalized: NormalizedMessage): Promise<void> {
  const correlationId = randomUUID();
  const logger = new WorkflowLogger('XpagLeadHandler', correlationId);

  logger.info('Workflow started', {
    whatsapp: normalized.clienteWhatsApp,
    type: normalized.messageType,
    instance: normalized.instanceName,
  });

  // ── STEP 1: RESOLVER TENANT ──────────────────────────────────────────────
  const tenant = await withTimeout(
    resolveTenantByInstance(normalized.instanceName),
    STEP_TIMEOUTS.tenant,
    'resolveTenant'
  ).catch((err) => {
    logger.error('Tenant resolution failed', { error: err.message });
    return null;
  });

  if (!tenant) return;
  logger.info('Tenant resolved', { userId: tenant.userId });

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

  // ── STEP 4: VERIFICAR MODO HUMANO ────────────────────────────────────────
  if (leadService.isInHumanMode(lead)) {
    // Salva a mensagem mesmo em modo humano (consultor pode ver no histórico)
    await conversationRepository.saveLeadMessage({
      lead_id: lead.id,
      message: normalized.mensagem,
      from_lead: true,
      ai_generated: false,
      user_id: tenant.userId,
    }).catch(() => null); // Não bloqueia o fluxo se falhar
    logger.info('Human mode — bot skipped');
    return;
  }

  // ── STEP 5: PROCESSAR MÍDIA ──────────────────────────────────────────────
  const processed = await withTimeout(
    processMessageByType(normalized, normalized.instanceName),
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

  // ── STEP 7: MONTAR CONTEXTO + EXECUTAR AGENTE ────────────────────────────
  const agentCtx = await buildAgentContext(normalized, processed, lead, isNew, tenant);

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

  // ── STEP 9: ENVIAR VIA WHATSAPP PROVIDER ────────────────────────────────
  const provider = getWhatsAppProvider();
  const { sent } = await withTimeout(
    provider.sendMessageSequence(normalized.instanceName, normalized.clienteWhatsApp, messages, 3000),
    STEP_TIMEOUTS.send,
    'sendMessages'
  ).catch((err) => {
    logger.error('Send messages failed', { error: err.message });
    return { sent: 0, failed: messages.length };
  });

  // ── STEP 10: PERSISTIR RESPOSTA ──────────────────────────────────────────
  if (sent > 0) {
    await Promise.all([
      conversationRepository.saveAgentResponse(lead.id, agentResult.output, tenant.userId),
      leadRepository.update(lead.id, { data_ultima_interacao: new Date().toISOString() }),
    ]).catch((err) => logger.warn('Persist response failed', { error: err.message }));
  }

  logger.info('Workflow completed', { sent, correlationId });
}
