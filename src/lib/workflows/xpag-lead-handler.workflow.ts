/**
 * WORKFLOW XPAG LEAD HANDLER
 * Orquestrador principal — substitui o workflow n8n "Xpag_Buscar_ou_Criar_Lead" completo.
 *
 * Fluxo equivalente:
 * WEBHOOK → NORMALIZAR → ANTI-LOOP → TENANT → LEAD → HISTÓRICO
 *   → PROCESSAR MÍDIA → SALVAR MSG → AI AGENT
 *   → HUMANIZAR → ENVIAR MENSAGENS → SALVAR RESPOSTA
 */

import type { NormalizedMessage } from '../services/message-normalizer.service';
import { resolveTenantByInstance, isFinalizationCommand } from '../services/tenant-resolver.service';
import { leadService } from '../services/lead.service';
import { processMessageByType } from '../handlers/message-type.handler';
import { buildAgentContext } from '../services/agent-context-builder.service';
import { conversationRepository } from '../repositories/conversation.repository';
import { executeAIAgent } from '../ai/ai-agent.service';
import { humanizeResponse } from '../services/message-humanizer.service';
import { sendMessageSequence } from '../integrations/evolution/messaging.client';
import { leadRepository } from '../repositories/lead.repository';
import { WorkflowLogger } from '../workflow-engine/workflow.logger';
import { randomUUID } from 'crypto';

export async function runXpagWorkflow(
  normalized: NormalizedMessage
): Promise<void> {
  const correlationId = randomUUID();
  const logger = new WorkflowLogger('XpagLeadHandler', correlationId);

  logger.info('Workflow started', {
    whatsapp: normalized.clienteWhatsApp,
    messageType: normalized.messageType,
    instance: normalized.instanceName,
  });

  // ─── STEP 1: RESOLVER TENANT ───────────────────────────────────────────────
  const tenant = await resolveTenantByInstance(normalized.instanceName);
  if (!tenant) {
    logger.warn('Tenant not found for instance', { instance: normalized.instanceName });
    return;
  }
  logger.info('Tenant resolved', { userId: tenant.userId });

  // ─── STEP 2: VERIFICAR COMANDO #FINALIZADO ─────────────────────────────────
  if (isFinalizationCommand(normalized.mensagem)) {
    const lead = await leadRepository.findByWhatsApp(normalized.clienteWhatsApp, tenant.userId);
    if (lead) {
      await leadService.returnToBot(lead.id);
      logger.info('#finalizado: Lead returned to bot mode', { leadId: lead.id });
    }
    return;
  }

  // ─── STEP 3: BUSCAR OU CRIAR LEAD ─────────────────────────────────────────
  const { lead, isNew } = await leadService.findOrCreate({
    clienteNome: normalized.clienteNome,
    clienteWhatsApp: normalized.clienteWhatsApp,
    clienteTelefone: normalized.clienteTelefone,
    userId: tenant.userId,
  });
  logger.info(isNew ? 'New lead created' : 'Lead found', { leadId: lead.id });

  // ─── STEP 4: VERIFICAR MODO ATENDIMENTO ───────────────────────────────────
  if (leadService.isInHumanMode(lead)) {
    logger.info('Lead in human mode — skipping bot response', { leadId: lead.id });
    // Salva a mensagem do lead no histórico mesmo em modo humano
    await conversationRepository.saveLeadMessage({
      lead_id: lead.id,
      message: normalized.mensagem,
      from_lead: true,
      ai_generated: false,
      user_id: tenant.userId,
    });
    return;
  }

  // ─── STEP 5: PROCESSAR MÍDIA ───────────────────────────────────────────────
  const processed = await processMessageByType(
    normalized,
    normalized.instanceName
  );
  logger.info('Media processed', { type: processed.messageType });

  // ─── STEP 6: SALVAR MENSAGEM DO LEAD ──────────────────────────────────────
  await conversationRepository.saveLeadMessage({
    lead_id: lead.id,
    message: processed.content,
    from_lead: true,
    ai_generated: false,
    user_id: tenant.userId,
  });

  // ─── STEP 7: MONTAR CONTEXTO DO AGENTE ────────────────────────────────────
  const agentCtx = await buildAgentContext(
    normalized,
    processed,
    lead,
    isNew,
    tenant
  );

  // ─── STEP 8: EXECUTAR AI AGENT ────────────────────────────────────────────
  logger.info('Executing AI Agent');
  const agentResult = await executeAIAgent(agentCtx);
  logger.info('AI Agent responded', {
    tools: agentResult.toolCalls,
    iterations: agentResult.iterations,
    outputLength: agentResult.output.length,
  });

  if (!agentResult.output.trim()) {
    logger.warn('AI Agent returned empty response — aborting send');
    return;
  }

  // ─── STEP 9: HUMANIZAR RESPOSTA ───────────────────────────────────────────
  const messages = await humanizeResponse(agentResult.output);
  logger.info('Response humanized', { parts: messages.length });

  // ─── STEP 10: ENVIAR MENSAGENS VIA EVOLUTION API ──────────────────────────
  const { sent, failed } = await sendMessageSequence(
    normalized.instanceName,
    normalized.clienteWhatsApp,
    messages,
    3000 // 3s entre mensagens (igual ao n8n Wait_Msg)
  );
  logger.info('Messages sent', { sent, failed });

  // ─── STEP 11: SALVAR RESPOSTA DO AGENTE ──────────────────────────────────
  if (sent > 0) {
    await conversationRepository.saveAgentResponse(
      lead.id,
      agentResult.output,
      tenant.userId
    );

    // Atualiza última interação
    await leadRepository.update(lead.id, {
      data_ultima_interacao: new Date().toISOString(),
    });
  }

  logger.info('Workflow completed', { correlationId });
}
