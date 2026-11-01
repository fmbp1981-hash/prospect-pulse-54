/**
 * Processamento comum das mensagens de entrada do WhatsApp (Sprint 2b).
 *
 * Recebe um evento JÁ autenticado pela conexão (rota por conexão ou rota legada
 * por token): `{ organizationId, connectionId, event }`. A organização vem
 * sempre da conexão, nunca do payload. A autenticação HTTP fica em
 * connection-inbound.handler.ts.
 *
 * Fluxo especial: mensagens fromMe=true durante modo humano são salvas
 * como mensagens do consultor, preservando contexto para quando o agente retomar.
 */

import { normalizeInboundEvent, type NormalizedMessage } from '@/lib/services/message-normalizer.service';
import { runLeadConversationWorkflow } from '@/lib/workflows/lead-conversation.workflow';
import { getWhatsAppForOrganization } from '@/lib/integrations/whatsapp/org-whatsapp';
import { ConnectionNotConfiguredError } from '@/lib/connectors/types';
import {
  resolveTenantByOrganization,
  type TenantContext,
} from '@/lib/services/tenant-resolver.service';
import { leadRepository } from '@/lib/repositories/lead.repository';
import { leadService } from '@/lib/services/lead.service';
import { conversationRepository } from '@/lib/repositories/conversation.repository';
import type { InboundMessageEvent } from './normalizers/inbound-event';

export interface InboundProcessingInput {
  organizationId: string;
  connectionId: string;
  event: InboundMessageEvent;
}

/**
 * Salva mensagem do consultor quando fromMe=true e lead em modo humano.
 * Nunca lança (roda em waitUntil depois do 200).
 *
 * Se é a primeira mensagem do consultor (ou >60s desde a última),
 * envia a tag "[Consultor X entrou na conversa]" pela conexão da organização.
 */
async function captureConsultantMessage(
  normalized: NormalizedMessage,
  tenant: TenantContext,
  organizationId: string
): Promise<void> {
  try {
    const lead = await leadRepository.findByWhatsApp(normalized.clienteWhatsApp, tenant.userId);
    if (!lead || lead.modo_atendimento !== 'humano') return;

    // Idempotência: envia tag de entrada somente se >60s desde última ação do consultor
    const lastAction = (lead as { data_ultima_acao_consultor?: string | null })
      .data_ultima_acao_consultor;
    const recentlyActive = lastAction
      && (Date.now() - new Date(lastAction).getTime()) < 60_000;

    if (!recentlyActive && lead.whatsapp) {
      // Logs só com código + organization_id: nada de telefone/payload.
      try {
        const consultantName = lead.consultor_responsavel || tenant.companyName || 'Consultor';
        const tagMessage = `[Consultor ${consultantName} entrou na conversa]`;
        const phone = String(lead.whatsapp).replace(/\D/g, '');

        const whatsapp = await getWhatsAppForOrganization(organizationId);
        const sent = await whatsapp.provider.sendText(whatsapp.target, phone, tagMessage);
        if (!sent.success) {
          console.warn('[Webhook] Tag de entrada do consultor não enviada:', 'whatsapp_send_failed', organizationId);
        } else {
          await conversationRepository.saveLeadMessage({
            lead_id: lead.id,
            message: tagMessage,
            from_lead: false,
            ai_generated: false,
            user_id: tenant.userId,
          });
          console.log(`[Webhook] Tag de entrada do consultor enviada — lead ${lead.id}`);
        }
      } catch (tagErr) {
        const code = tagErr instanceof ConnectionNotConfiguredError ? 'whatsapp_not_configured' : 'whatsapp_tag_error';
        console.warn('[Webhook] Falha ao enviar tag de entrada do consultor:', code, organizationId);
        // Não impede o salvamento da mensagem abaixo
      }
    }

    await conversationRepository.saveLeadMessage({
      lead_id: lead.id,
      message: `[Consultor] ${normalized.mensagem}`,
      from_lead: false,
      ai_generated: false,
      user_id: tenant.userId,
    });

    // Registra timestamp da última ação do consultor (usado para auto-retomada por timeout)
    await leadService.recordConsultantActivity(lead.id);

    console.log(`[Webhook] Mensagem do consultor salva — lead ${lead.id}`);
  } catch (err) {
    // Só a mensagem: o objeto de erro pode carregar payload/telefone (LGPD).
    console.warn(
      '[Webhook] Falha ao capturar mensagem do consultor:',
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Processa um evento de entrada autenticado. Chamado em waitUntil, depois do 200.
 * Erros de infraestrutura propagam para o chamador (que só loga o código).
 */
export async function processInboundWhatsAppEvent(input: InboundProcessingInput): Promise<void> {
  const { organizationId, connectionId } = input;
  const normalized = normalizeInboundEvent(input.event);

  if (normalized.messageType === 'unknown') {
    console.log('[Webhook] Evento ignorado:', 'unsupported_message_type', connectionId);
    return;
  }

  const tenant = await resolveTenantByOrganization(organizationId);
  if (!tenant) {
    console.warn('[Webhook] Evento não processado:', 'organization_without_member', organizationId);
    return;
  }

  // fromMe=true: pode ser mensagem do bot (loop) ou do consultor (intervenção humana)
  if (normalized.fromMe) {
    await captureConsultantMessage(normalized, tenant, organizationId);
    return;
  }

  await runLeadConversationWorkflow(normalized, tenant, organizationId);
}
