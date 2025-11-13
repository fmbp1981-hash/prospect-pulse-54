import { supabase } from "@/integrations/supabase/client";
import { Lead, DashboardMetrics, LeadStatus } from "@/types/prospection";

/**
 * Integração direta com Supabase para operações de CRM
 * Substitui completamente a integração MCP/n8n
 */

// ============= SYNC LEADS =============
export async function syncAllLeads(): Promise<{ success: boolean; leads: Lead[]; message?: string }> {
  try {
    const { data, error } = await (supabase as any)
      .from("leads_prospeccao")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const leads: Lead[] = (data || []).map((row: any) => ({
      id: row.id,
      lead: row.nome_lead || "",
      status: (row.status || "Novo Lead") as LeadStatus,
      empresa: row.empresa || "",
      whatsapp: row.telefone || "",
      statusMsgWA: row.status_msg_wa || "not_sent",
      dataEnvioWA: row.data_envio_wa || null,
      origem: row.origem || "Google Places",
      prioridade: row.prioridade || "Média",
      regiao: row.regiao || "",
      segmento: row.segmento || "",
      ticketMedioEstimado: row.ticket_medio_estimado || 0,
      contatoPrincipal: row.contato_principal || "",
      dataContato: row.data_contato || new Date().toISOString(),
      observacoes: row.observacoes || "",
      mensagemWhatsApp: row.mensagem_whatsapp || "",
    }));

    return { success: true, leads };
  } catch (error: any) {
    console.error("Erro ao sincronizar leads:", error);
    return { 
      success: false, 
      leads: [], 
      message: error.message || "Erro ao carregar leads do banco de dados" 
    };
  }
}

// ============= UPDATE LEAD =============
export async function updateLead(
  leadId: string, 
  updates: Partial<Lead>
): Promise<{ success: boolean; message: string }> {
  try {
    const dbUpdates: any = {};
    
    if (updates.lead) dbUpdates.nome_lead = updates.lead;
    if (updates.status) dbUpdates.status = updates.status;
    if (updates.empresa) dbUpdates.empresa = updates.empresa;
    if (updates.whatsapp) dbUpdates.telefone = updates.whatsapp;
    if (updates.statusMsgWA) dbUpdates.status_msg_wa = updates.statusMsgWA;
    if (updates.dataEnvioWA) dbUpdates.data_envio_wa = updates.dataEnvioWA;
    if (updates.origem) dbUpdates.origem = updates.origem;
    if (updates.prioridade) dbUpdates.prioridade = updates.prioridade;
    if (updates.regiao) dbUpdates.regiao = updates.regiao;
    if (updates.segmento) dbUpdates.segmento = updates.segmento;
    if (updates.ticketMedioEstimado !== undefined) dbUpdates.ticket_medio_estimado = updates.ticketMedioEstimado;
    if (updates.contatoPrincipal) dbUpdates.contato_principal = updates.contatoPrincipal;
    if (updates.observacoes) dbUpdates.observacoes = updates.observacoes;
    if (updates.mensagemWhatsApp) dbUpdates.mensagem_whatsapp = updates.mensagemWhatsApp;

    const { error } = await (supabase as any)
      .from("leads_prospeccao")
      .update(dbUpdates)
      .eq("id", leadId);

    if (error) throw error;

    return { success: true, message: "Lead atualizado com sucesso" };
  } catch (error: any) {
    console.error("Erro ao atualizar lead:", error);
    return { success: false, message: error.message || "Erro ao atualizar lead" };
  }
}

// ============= UPDATE LEAD STATUS =============
export async function updateLeadStatus(
  leadId: string, 
  status: LeadStatus
): Promise<{ success: boolean; message: string }> {
  return updateLead(leadId, { status });
}

// ============= CREATE LEAD =============
export async function createLead(
  leadData: Omit<Lead, "id">
): Promise<{ success: boolean; leadId?: string; message: string }> {
  try {
    const { data, error } = await (supabase as any)
      .from("leads_prospeccao")
      .insert({
        nome_lead: leadData.lead,
        status: leadData.status || "Novo Lead",
        empresa: leadData.empresa,
        telefone: leadData.whatsapp,
        status_msg_wa: leadData.statusMsgWA || "not_sent",
        origem: leadData.origem || "Google Places",
        prioridade: leadData.prioridade || "Média",
        regiao: leadData.regiao,
        segmento: leadData.segmento,
        ticket_medio_estimado: leadData.ticketMedioEstimado || 0,
        contato_principal: leadData.contatoPrincipal,
        data_contato: leadData.dataContato || new Date().toISOString(),
        observacoes: leadData.observacoes,
        mensagem_whatsapp: leadData.mensagemWhatsApp || "",
      })
      .select()
      .single();

    if (error) throw error;

    return { 
      success: true, 
      leadId: data.id,
      message: "Lead criado com sucesso" 
    };
  } catch (error: any) {
    console.error("Erro ao criar lead:", error);
    return { 
      success: false, 
      message: error.message || "Erro ao criar lead" 
    };
  }
}

// ============= GET METRICS =============
export async function getMetrics(): Promise<{ 
  success: boolean; 
  metrics?: DashboardMetrics; 
  message?: string 
}> {
  try {
    const { data: leads, error } = await (supabase as any)
      .from("leads_prospeccao")
      .select("*");

    if (error) throw error;

    const totalLeads = leads?.length || 0;
    const statusCounts = {
      "Novo Lead": 0,
      "Contato Inicial": 0,
      "Qualificação": 0,
      "Proposta Enviada": 0,
      "Negociação": 0,
      "Fechado Ganho": 0,
      "Fechado Perdido": 0,
      "Em Follow-up": 0,
    };

    const originCounts: Record<string, number> = {};
    let totalValue = 0;
    let whatsappSent = 0;

    leads?.forEach((lead: any) => {
      const status = lead.status || "Novo Lead";
      if (status in statusCounts) {
        statusCounts[status as LeadStatus]++;
      }

      const origin = lead.origem || "Google Places";
      originCounts[origin] = (originCounts[origin] || 0) + 1;

      totalValue += lead.ticket_medio_estimado || 0;

      if (lead.status_msg_wa === "sent") {
        whatsappSent++;
      }
    });

    const conversionRate = totalLeads > 0 
      ? ((statusCounts["Fechado Ganho"] / totalLeads) * 100)
      : 0;

    const metrics: DashboardMetrics = {
      totalLeads,
      novoLeads: statusCounts["Novo Lead"],
      emNegociacao: statusCounts["Negociação"],
      fechadoGanho: statusCounts["Fechado Ganho"],
      fechadoPerdido: statusCounts["Fechado Perdido"],
      taxaConversao: conversionRate,
      ticketMedioTotal: totalValue,
      leadsPorStatus: statusCounts,
      leadsPorOrigem: originCounts,
      leadsPorRegiao: {},
      leadsPorSegmento: {},
      mensagensEnviadas: whatsappSent,
      mensagensPendentes: totalLeads - whatsappSent,
      proximosFollowUps: [],
    };

    return { success: true, metrics };
  } catch (error: any) {
    console.error("Erro ao calcular métricas:", error);
    return { 
      success: false, 
      message: error.message || "Erro ao calcular métricas" 
    };
  }
}

// ============= WHATSAPP OPERATIONS =============
export async function getLeadsForWhatsApp(
  leadIds: string[]
): Promise<{ success: boolean; leads: Lead[]; message?: string }> {
  try {
    const { data, error } = await (supabase as any)
      .from("leads_prospeccao")
      .select("*")
      .in("id", leadIds);

    if (error) throw error;

    const leads: Lead[] = (data || []).map((row: any) => ({
      id: row.id,
      lead: row.nome_lead || "",
      status: (row.status || "Novo Lead") as LeadStatus,
      empresa: row.empresa || "",
      whatsapp: row.telefone || "",
      statusMsgWA: row.status_msg_wa || "not_sent",
      dataEnvioWA: row.data_envio_wa || null,
      origem: row.origem || "Google Places",
      prioridade: row.prioridade || "Média",
      regiao: row.regiao || "",
      segmento: row.segmento || "",
      ticketMedioEstimado: row.ticket_medio_estimado || 0,
      contatoPrincipal: row.contato_principal || "",
      dataContato: row.data_contato || new Date().toISOString(),
      observacoes: row.observacoes || "",
      mensagemWhatsApp: row.mensagem_whatsapp || "",
    }));

    return { success: true, leads };
  } catch (error: any) {
    console.error("Erro ao buscar leads para WhatsApp:", error);
    return { 
      success: false, 
      leads: [],
      message: error.message || "Erro ao buscar leads" 
    };
  }
}

// Exportar como objeto compatível com a API antiga
export const supabaseCRM = {
  syncAllLeads,
  updateLead,
  updateLeadStatus,
  createLead,
  getMetrics,
  getLeadsForWhatsApp,
};
