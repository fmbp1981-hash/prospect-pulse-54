/**
 * TOOL: atualizar_lead
 * Atualiza campos do lead + agenda follow-up de longo prazo quando aplicável.
 */

import { leadService } from '../../services/lead.service';
import { detectFollowUpScenario } from '../../services/long-followup-rules.service';
import { scheduleFirstFollowUp } from '../../jobs/long-followup.job';
import type { AgentTool, ToolExecutionContext } from './tool.interface';

export const updateLeadTool: AgentTool = {
  name: 'atualizar_lead',
  description:
    'Atualiza informações do lead no banco de dados. Use para atualizar status_msg_wa, estagio_pipeline, empresa, modo_atendimento ou motivo_follow_up.',
  parameters: {
    type: 'object',
    properties: {
      status_msg_wa: {
        type: 'string',
        description:
          'Status da conversa WhatsApp. Valores: not_sent, Em Conversa, Qualificando, Qualificado, Follow-up, Transferido',
      },
      estagio_pipeline: {
        type: 'string',
        description:
          'Estágio no funil. Ex: Novo Lead, Contato Inicial, Qualificação, Transferido para Consultor, Follow-up',
      },
      empresa: { type: 'string', description: 'Nome da empresa do lead' },
      modo_atendimento: { type: 'string', description: '"bot" ou "humano"' },
      motivo_follow_up: { type: 'string', description: 'Motivo do follow-up' },
      faturamento_declarado: { type: 'string', description: 'Faturamento declarado' },
      usa_meios_pagamento: { type: 'string', description: 'Uso de meios de pagamento' },
    },
  },

  async execute(args, ctx): Promise<{ success: boolean; updated: Record<string, unknown> }> {
    const allowedFields = [
      'status_msg_wa', 'estagio_pipeline', 'empresa',
      'modo_atendimento', 'motivo_follow_up', 'faturamento_declarado', 'usa_meios_pagamento',
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (args[field] !== undefined) updates[field] = args[field];
    }

    const updated = await leadService.updateLead(ctx.leadId, updates as Parameters<typeof leadService.updateLead>[1]);

    // Agenda follow-up de longo prazo se o novo status indicar necessidade
    const newScenario = detectFollowUpScenario({
      status_msg_wa: (updates.status_msg_wa as string) ?? updated.status_msg_wa,
      estagio_pipeline: (updates.estagio_pipeline as string) ?? updated.estagio_pipeline,
      data_ultima_interacao: updated.data_ultima_interacao,
      follow_up_count: updated.follow_up_count as number | null,
    });

    if (newScenario && newScenario !== 'no_response_short') {
      scheduleFirstFollowUp(ctx.leadId, newScenario, ctx.instanceName, ctx.userId)
        .catch((err) => console.warn('[UpdateLeadTool] scheduleFirstFollowUp error:', err?.message));
    }

    return { success: true, updated: updates };
  },
};
