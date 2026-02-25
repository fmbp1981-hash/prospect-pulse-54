/**
 * TOOL: transferir_para_consultor
 * Notifica o consultor via WhatsApp e marca o lead como transferido/humano.
 * Lê o WhatsApp do consultor e a instância do agente das configurações do tenant (user_settings).
 */

import { createClient } from '@supabase/supabase-js';
import { sendWhatsAppText } from '../../integrations/evolution/messaging.client';
import { leadRepository } from '../../repositories/lead.repository';
import type { AgentTool, ToolExecutionContext } from './tool.interface';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function getConsultantConfig(userId: string): Promise<{
  consultantWhatsapp: string | null;
  agentInstance: string | null;
}> {
  try {
    const supabase = getServiceClient();
    const { data } = await supabase
      .from('user_settings')
      .select('consultant_whatsapp, evolution_instance_name')
      .eq('user_id', userId)
      .single();

    return {
      consultantWhatsapp: data?.consultant_whatsapp || process.env.XPAG_CONSULTANT_WHATSAPP || null,
      agentInstance: data?.evolution_instance_name || process.env.XPAG_CONSULTANT_INSTANCE || null,
    };
  } catch {
    return {
      consultantWhatsapp: process.env.XPAG_CONSULTANT_WHATSAPP || null,
      agentInstance: process.env.XPAG_CONSULTANT_INSTANCE || null,
    };
  }
}

export const transferConsultantTool: AgentTool = {
  name: 'transferir_para_consultor',
  description:
    'Transfere o lead para o consultor. Envia notificação via WhatsApp ao consultor com os dados do lead e atualiza modo de atendimento para "humano". Chame apenas quando o lead estiver qualificado e demonstrar interesse real.',
  parameters: {
    type: 'object',
    properties: {
      motivo: {
        type: 'string',
        description: 'Motivo ou resumo do interesse do lead (opcional)',
      },
    },
  },

  async execute(
    args: Record<string, unknown>,
    ctx: ToolExecutionContext
  ): Promise<{
    success: boolean;
    details: { db_ok: boolean; msg_ok: boolean; error?: string };
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
      return { success: false, details: { db_ok: false, msg_ok: false, error: String(err) } };
    }

    // 3. Busca configurações do consultor e instância do agente
    const { consultantWhatsapp, agentInstance } = await getConsultantConfig(ctx.userId);

    if (!consultantWhatsapp || !agentInstance) {
      console.warn(
        '[TransferTool] WhatsApp do consultor ou instância do agente não configurados. ' +
        'Configure em Configurações → Agente de Atendimento.'
      );
      return {
        success: dbOk,
        details: {
          db_ok: dbOk,
          msg_ok: false,
          error: 'WhatsApp do consultor não configurado nas Configurações do sistema.',
        },
      };
    }

    // 4. Envia notificação ao consultor
    const message =
      `🔔 *Novo Lead Qualificado para Atendimento*\n\n` +
      `👤 *Nome:* ${leadName}\n` +
      `🏢 *Empresa:* ${leadCompany}\n` +
      `📱 *WhatsApp:* ${ctx.whatsapp}\n` +
      `📊 *Status:* ${leadStatus}\n` +
      `💬 *Motivo:* ${motivo}\n\n` +
      `_Enviado automaticamente pelo sistema XPAG_`;

    const result = await sendWhatsAppText({
      instanceName: agentInstance,
      to: consultantWhatsapp.replace(/\D/g, ''),
      text: message,
    });

    msgOk = result.success;

    if (!msgOk) {
      console.warn('[TransferTool] Notificação ao consultor falhou:', result);
    }

    return {
      success: dbOk,
      details: { db_ok: dbOk, msg_ok: msgOk },
    };
  },
};
