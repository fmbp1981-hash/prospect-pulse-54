import { supabase } from "@/integrations/supabase/client";
import { Lead, DashboardMetrics, LeadStatus } from "@/types/prospection";
import { LEAD_STATUS, LEAD_ORIGIN, LEAD_PRIORITY, WHATSAPP_STATUS } from "@/lib/constants";

/**
 * Integração direta com Supabase para operações de CRM
 * Substitui completamente a integração MCP/n8n
 */

// ============= SYNC LEADS =============
export async function syncAllLeads(): Promise<{ success: boolean; leads: Lead[]; message?: string }> {
  try {
    const { data, error } = await supabase
      .from("leads_prospeccao")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const leads: Lead[] = (data || []).map((row: any) => ({
      id: row.id,
      lead: row.lead || "",
      status: (row.status || LEAD_STATUS.NOVO) as LeadStatus,
      data: row.data || "",
      empresa: row.empresa || "",
      categoria: row.categoria || "",
      contato: row.contato || "",
      whatsapp: row.telefone_whatsapp || "",
      email: row.email || "",
      website: row.website || "",
      instagram: row.instagram || "",
      cidade: row.cidade || "",
      endereco: row.endereco || "",
      bairroRegiao: row.bairro_regiao || "",
      linkGMN: row.link_gmn || "",
      aceitaCartao: row.aceita_cartao || "",
      cnpj: row.cnpj || "",
      mensagemWhatsApp: row.mensagem_whatsapp || "",
      statusMsgWA: row.status_msg_wa || WHATSAPP_STATUS.NOT_SENT,
      dataEnvioWA: row.data_envio_wa || null,
      resumoAnalitico: row.resumo_analitico || "",
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || new Date().toISOString(),

      // Campos virtuais (não existem no banco)
      origem: LEAD_ORIGIN.PROSPECCAO_ATIVA,
      prioridade: LEAD_PRIORITY.MEDIA,
      regiao: row.cidade || "",
      segmento: row.categoria || "",
      ticketMedioEstimado: 0,
      contatoPrincipal: row.contato || "",
      dataContato: row.created_at || new Date().toISOString(),
      observacoes: "",
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
    const dbUpdates: Record<string, unknown> = {};

    if (updates.lead) dbUpdates.lead = updates.lead;
    if (updates.status) dbUpdates.status = updates.status;
    if (updates.empresa) dbUpdates.empresa = updates.empresa;
    if (updates.categoria) dbUpdates.categoria = updates.categoria;
    if (updates.contato) dbUpdates.contato = updates.contato;
    if (updates.whatsapp) dbUpdates.telefone_whatsapp = updates.whatsapp;
    if (updates.email) dbUpdates.email = updates.email;
    if (updates.cidade) dbUpdates.cidade = updates.cidade;
    if (updates.endereco) dbUpdates.endereco = updates.endereco;
    if (updates.bairroRegiao) dbUpdates.bairro_regiao = updates.bairroRegiao;
    if (updates.website) dbUpdates.website = updates.website;
    if (updates.instagram) dbUpdates.instagram = updates.instagram;
    if (updates.linkGMN) dbUpdates.link_gmn = updates.linkGMN;
    if (updates.aceitaCartao) dbUpdates.aceita_cartao = updates.aceitaCartao;
    if (updates.mensagemWhatsApp) dbUpdates.mensagem_whatsapp = updates.mensagemWhatsApp;
    if (updates.statusMsgWA) dbUpdates.status_msg_wa = updates.statusMsgWA;
    if (updates.dataEnvioWA) dbUpdates.data_envio_wa = updates.dataEnvioWA;
    if (updates.resumoAnalitico) dbUpdates.resumo_analitico = updates.resumoAnalitico;
    if (updates.cnpj) dbUpdates.cnpj = updates.cnpj;
    if (updates.data) dbUpdates.data = updates.data;

    const { error } = await supabase
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
    const { data, error } = await supabase
      .from("leads_prospeccao")
      .insert({
        lead: leadData.lead,
        status: leadData.status || LEAD_STATUS.NOVO_LEAD,
        empresa: leadData.empresa,
        categoria: leadData.categoria,
        contato: leadData.contatoPrincipal,
        whatsapp: leadData.whatsapp,
        email: leadData.email,
        cidade: leadData.cidade,
        endereco: leadData.endereco,
        bairro_regiao: leadData.bairroRegiao,
        website: leadData.website,
        instagram: leadData.instagram,
        link_gmn: leadData.linkGMN,
        aceita_cartao: leadData.aceitaCartao,
        mensagem_whatsapp: leadData.mensagemWhatsApp || "",
        status_msg_wa: leadData.statusMsgWA || WHATSAPP_STATUS.NOT_SENT,
        resumo_analitico: leadData.resumoAnalitico,
        cnpj: leadData.cnpj,
        data: leadData.data,
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
    const { data: leads, error } = await supabase
      .from("leads_prospeccao")
      .select("*");

    if (error) throw error;

    const totalLeads = leads?.length || 0;
    const statusCounts: Record<LeadStatus, number> = {
      [LEAD_STATUS.NOVO_LEAD]: 0,
      [LEAD_STATUS.CONTATO_INICIAL]: 0,
      [LEAD_STATUS.QUALIFICACAO]: 0,
      [LEAD_STATUS.PROPOSTA_ENVIADA]: 0,
      [LEAD_STATUS.NEGOCIACAO]: 0,
      [LEAD_STATUS.FECHADO_GANHO]: 0,
      [LEAD_STATUS.FECHADO_PERDIDO]: 0,
      [LEAD_STATUS.EM_FOLLOWUP]: 0,
    };

    const originCounts: Record<string, number> = {};
    let totalValue = 0;
    let whatsappSent = 0;

    leads?.forEach((lead: any) => {
      const status = lead.status || LEAD_STATUS.NOVO_LEAD;
      if (status in statusCounts) {
        statusCounts[status as LeadStatus]++;
      }

      const origin = lead.categoria || LEAD_ORIGIN.GOOGLE_PLACES;
      originCounts[origin] = (originCounts[origin] || 0) + 1;

      totalValue += 0; // ticket_medio_estimado não existe no banco

      if (lead.status_msg_wa === WHATSAPP_STATUS.SENT) {
        whatsappSent++;
      }
    });

    const conversionRate = totalLeads > 0
      ? ((statusCounts[LEAD_STATUS.FECHADO_GANHO] / totalLeads) * 100)
      : 0;

    const metrics: DashboardMetrics = {
      totalLeads,
      novoLeads: statusCounts[LEAD_STATUS.NOVO_LEAD],
      emNegociacao: statusCounts[LEAD_STATUS.NEGOCIACAO],
      fechadoGanho: statusCounts[LEAD_STATUS.FECHADO_GANHO],
      fechadoPerdido: statusCounts[LEAD_STATUS.FECHADO_PERDIDO],
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
    const { data, error } = await supabase
      .from("leads_prospeccao")
      .select("*")
      .in("id", leadIds);

    if (error) throw error;

    const leads: Lead[] = (data || []).map((row: any) => ({
      id: row.id,
      lead: row.lead || "",
      status: (row.status || LEAD_STATUS.NOVO_LEAD) as LeadStatus,
      empresa: row.empresa || "",
      categoria: row.categoria || "",
      contato: row.contato || "",
      whatsapp: row.telefone_whatsapp || "",
      email: row.email || "",
      cidade: row.cidade || "",
      endereco: row.endereco || "",
      bairroRegiao: row.bairro_regiao || "",
      website: row.website || "",
      instagram: row.instagram || "",
      linkGMN: row.link_gmn || "",
      aceitaCartao: row.aceita_cartao || "",
      mensagemWhatsApp: row.mensagem_whatsapp || "",
      statusMsgWA: row.status_msg_wa || WHATSAPP_STATUS.NOT_SENT,
      dataEnvioWA: row.data_envio_wa || null,
      resumoAnalitico: row.resumo_analitico || "",
      cnpj: row.cnpj || "",
      data: row.data || "",

      // Campos virtuais
      origem: LEAD_ORIGIN.GOOGLE_PLACES,
      prioridade: LEAD_PRIORITY.MEDIA,
      regiao: row.cidade || "",
      segmento: row.categoria || "",
      ticketMedioEstimado: 0,
      contatoPrincipal: row.contato || "",
      dataContato: row.created_at || new Date().toISOString(),
      observacoes: "",
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
