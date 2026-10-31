/**
 * TOOL: transferir_para_consultor
 * Notifica o consultor via WhatsApp e marca o lead como transferido/humano.
 * Lê o WhatsApp do consultor das configurações do tenant (user_settings); a
 * notificação sai pela conexão de WhatsApp ativa da organização do lead
 * (Sprint 2b). Sem conexão, o lead é transferido mas a notificação não sai.
 */

import { createClient } from '@supabase/supabase-js';
import { getWhatsAppForOrganization, type OrgWhatsApp } from '../../integrations/whatsapp/org-whatsapp';
import { ConnectionNotConfiguredError } from '../../connectors/types';
import { resolveLeadOrganizationId } from '../../connectors/org-context';
import { leadRepository } from '../../repositories/lead.repository';
import type { AgentTool, ToolExecutionContext } from './tool.interface';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function getConsultantWhatsapp(userId: string): Promise<string | null> {
  try {
    const supabase = getServiceClient();
    const { data } = await supabase
      .from('user_settings')
      .select('consultant_whatsapp')
      .eq('user_id', userId)
      .single();

    return data?.consultant_whatsapp || null;
  } catch {
    return null;
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
    const leadPipelineStage = lead?.estagio_pipeline || '-';
    const motivo = (args.motivo as string) || 'Lead qualificado';

    // 2. Atualiza lead no banco
    try {
      await leadRepository.update(ctx.leadId, {
        modo_atendimento: 'humano',
        status_msg_wa: 'Transferido',
        estagio_pipeline: 'Transferido para Consultor',
        data_transferencia: new Date().toISOString(),
      });
      dbOk = true;
    } catch (err) {
      console.error('[TransferTool] DB update failed:', err);
      return { success: false, details: { db_ok: false, msg_ok: false, error: String(err) } };
    }

    // 3. WhatsApp do consultor (user_settings)
    const consultantWhatsapp = await getConsultantWhatsapp(ctx.userId);

    if (!consultantWhatsapp) {
      console.warn(
        '[TransferTool] WhatsApp do consultor não configurado. ' +
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

    // 4. Conexão de WhatsApp da organização do lead
    const organizationId = await resolveLeadOrganizationId({
      organization_id: lead?.organization_id ?? null,
      user_id: lead?.user_id ?? ctx.userId,
    });
    if (!organizationId) {
      console.warn('[TransferTool] notificação não enviada', { organization_id: null, code: 'lead_without_organization' });
      return {
        success: dbOk,
        details: { db_ok: dbOk, msg_ok: false, error: 'Lead sem organização.' },
      };
    }

    let whatsapp: OrgWhatsApp;
    try {
      whatsapp = await getWhatsAppForOrganization(organizationId);
    } catch (err) {
      const notConfigured = err instanceof ConnectionNotConfiguredError;
      console.warn('[TransferTool] notificação não enviada', {
        organization_id: organizationId,
        code: notConfigured ? 'whatsapp_not_configured' : 'whatsapp_connection_error',
      });
      return {
        success: dbOk,
        details: {
          db_ok: dbOk,
          msg_ok: false,
          error: notConfigured
            ? 'WhatsApp não configurado para esta organização.'
            : 'WhatsApp indisponível no momento.',
        },
      };
    }

    // 5. Envia notificação ao consultor
    const message =
      `🔔 *Novo Lead Qualificado para Atendimento*\n\n` +
      `👤 *Nome:* ${leadName}\n` +
      `🏢 *Empresa:* ${leadCompany}\n` +
      `📱 *WhatsApp:* ${ctx.whatsapp}\n` +
      `📋 *Estágio:* ${leadPipelineStage}\n` +
      `💬 *Motivo:* ${motivo}\n\n` +
      `_Enviado automaticamente pelo LeadFinder Pro_`;

    const result = await whatsapp.provider.sendText(
      whatsapp.target,
      consultantWhatsapp.replace(/\D/g, ''),
      message
    );

    msgOk = result.success;

    if (!msgOk) {
      console.warn('[TransferTool] notificação ao consultor falhou', {
        organization_id: organizationId,
        code: 'whatsapp_send_failed',
      });
    }

    return {
      success: dbOk,
      details: { db_ok: dbOk, msg_ok: msgOk },
    };
  },
};
