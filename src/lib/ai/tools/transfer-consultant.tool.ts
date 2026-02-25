/**
 * TOOL: transferir_para_consultor
 * Equivalente nativo à tool "transferir_para_consultor" do AI Agent no n8n.
 * Notifica o consultor via WhatsApp e atualiza modo para "humano".
 */

import { sendWhatsAppText } from '../../integrations/evolution/messaging.client';
import { leadRepository } from '../../repositories/lead.repository';
import type { AgentTool, ToolExecutionContext } from './tool.interface';

const CONSULTANT_WHATSAPP = process.env.XPAG_CONSULTANT_WHATSAPP!; // ex: 5581999990000
const CONSULTANT_INSTANCE = process.env.XPAG_CONSULTANT_INSTANCE!;

export const transferConsultantTool: AgentTool = {
  name: 'transferir_para_consultor',
  description:
    'Transfere o lead para o consultor Felipe. Envia notificação via WhatsApp ao consultor e atualiza modo de atendimento para "humano". Chame apenas quando o lead estiver qualificado e demonstrar interesse real.',
  parameters: {
    type: 'object',
    properties: {
      motivo: {
        type: 'string',
        description: 'Motivo ou contexto da transferência (opcional)',
      },
    },
  },
  async execute(
    args: Record<string, unknown>,
    ctx: ToolExecutionContext
  ): Promise<{
    success: boolean;
    details: { db_ok: boolean; msg_ok: boolean };
  }> {
    let dbOk = false;
    let msgOk = false;

    // 1. Busca dados atualizados do lead
    const lead = await leadRepository.findByWhatsApp(ctx.whatsapp, ctx.userId);
    const leadName = lead?.lead || 'Lead';
    const leadCompany = lead?.empresa || 'Empresa não informada';
    const leadStatus = lead?.status_msg_wa || '-';
    const motivo = (args.motivo as string) || 'Lead qualificado';

    // 2. Atualiza lead no banco
    try {
      await leadRepository.update(ctx.leadId, {
        modo_atendimento: 'humano',
        status_msg_wa: 'Transferido',
        estagio_pipeline: 'Transferido para Consultor',
        data_transferencia: new Date().toISOString(),
        consultor_responsavel: 'Felipe',
      });
      dbOk = true;
    } catch (err) {
      console.error('[TransferTool] DB update failed:', err);
    }

    // 3. Envia notificação ao consultor
    if (CONSULTANT_WHATSAPP && CONSULTANT_INSTANCE) {
      const message =
        `🔔 *Novo Lead Qualificado para Atendimento*\n\n` +
        `👤 *Nome:* ${leadName}\n` +
        `🏢 *Empresa:* ${leadCompany}\n` +
        `📱 *WhatsApp:* ${ctx.whatsapp}\n` +
        `📊 *Status:* ${leadStatus}\n` +
        `💬 *Motivo:* ${motivo}\n\n` +
        `_Enviado automaticamente pelo sistema XPAG_`;

      const result = await sendWhatsAppText({
        instanceName: CONSULTANT_INSTANCE,
        to: CONSULTANT_WHATSAPP,
        text: message,
      });

      msgOk = result.success;
    } else {
      console.warn('[TransferTool] Consultant WhatsApp not configured — skipping notification');
    }

    return {
      success: dbOk,
      details: { db_ok: dbOk, msg_ok: msgOk },
    };
  },
};
