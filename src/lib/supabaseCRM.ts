import { supabase } from "@/integrations/supabase/client";
import { Lead, DashboardMetrics, LeadStatus, WhatsAppStatus } from "@/types/prospection";
import { LEAD_STATUS, LEAD_ORIGIN, LEAD_PRIORITY, WHATSAPP_STATUS } from "@/lib/constants";

/**
 * Integração direta com Supabase para operações de CRM
 * Substitui completamente a integração MCP/n8n
 */

// ============= TYPES =============
interface SupabaseLeadRow {
  id: string;
  lead?: string;
  status?: string;
  data?: string;
  empresa?: string;
  categoria?: string;
  contato?: string;
  whatsapp?: string;
  telefone?: string;
  email?: string;
  website?: string;
  instagram?: string;
  cidade?: string;
  endereco?: string;
  bairro?: string;
  bairro_regiao?: string;
  link_gmn?: string;
  aceita_cartao?: string;
  cnpj?: string;
  mensagem_whatsapp?: string;
  status_msg_wa?: string;
  data_envio_wa?: string;
  resumo_analitico?: string;
  created_at?: string;
  updated_at?: string;
}

// ============= SYNC LEADS =============
export async function syncAllLeads(): Promise<{ success: boolean; leads: Lead[]; message?: string }> {
  try {
    const { data, error } = await supabase
      .from("leads_prospeccao")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const leads: Lead[] = (data || []).map((row: SupabaseLeadRow) => ({
      id: row.id,
      lead: row.lead || "",
      status: (row.status || LEAD_STATUS.NOVO) as LeadStatus,
      data: row.data || "",
      empresa: row.empresa || "",
      categoria: row.categoria || "",
      contato: row.contato || "",
      whatsapp: row.whatsapp || "",
      telefone: row.telefone || "",
      email: row.email || "",
      website: row.website || "",
      instagram: row.instagram || "",
      cidade: row.cidade || "",
      endereco: row.endereco || "",
      bairro: row.bairro || "",
      bairroRegiao: row.bairro_regiao || "",
      linkGMN: row.link_gmn || "",
      aceitaCartao: row.aceita_cartao || "",
      cnpj: row.cnpj || "",
      mensagemWhatsApp: row.mensagem_whatsapp || "",
      statusMsgWA: (row.status_msg_wa || WHATSAPP_STATUS.NOT_SENT) as WhatsAppStatus,
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
  } catch (error: unknown) {
    console.error("Erro ao sincronizar leads:", error);
    return {
      success: false,
      leads: [],
      message: (error as Error).message || "Erro ao carregar leads do banco de dados"
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

    if (updates.lead !== undefined) dbUpdates.lead = updates.lead;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.empresa !== undefined) dbUpdates.empresa = updates.empresa;
    if (updates.categoria !== undefined) dbUpdates.categoria = updates.categoria;
    if (updates.contato !== undefined) dbUpdates.contato = updates.contato;
    if (updates.whatsapp !== undefined) dbUpdates.whatsapp = updates.whatsapp;
    if (updates.telefone !== undefined) dbUpdates.telefone = updates.telefone;
    if (updates.email !== undefined) dbUpdates.email = updates.email;
    if (updates.cidade !== undefined) dbUpdates.cidade = updates.cidade;
    if (updates.endereco !== undefined) dbUpdates.endereco = updates.endereco;
    if (updates.bairro !== undefined) dbUpdates.bairro = updates.bairro;
    if (updates.bairroRegiao !== undefined) dbUpdates.bairro_regiao = updates.bairroRegiao;
    if (updates.website !== undefined) dbUpdates.website = updates.website;
    if (updates.instagram !== undefined) dbUpdates.instagram = updates.instagram;
    if (updates.linkGMN !== undefined) dbUpdates.link_gmn = updates.linkGMN;
    if (updates.aceitaCartao !== undefined) dbUpdates.aceita_cartao = updates.aceitaCartao;
    if (updates.mensagemWhatsApp !== undefined) dbUpdates.mensagem_whatsapp = updates.mensagemWhatsApp;
    if (updates.statusMsgWA !== undefined) dbUpdates.status_msg_wa = updates.statusMsgWA;
    if (updates.dataEnvioWA !== undefined) dbUpdates.data_envio_wa = updates.dataEnvioWA;
    if (updates.resumoAnalitico !== undefined) dbUpdates.resumo_analitico = updates.resumoAnalitico;
    if (updates.cnpj !== undefined) dbUpdates.cnpj = updates.cnpj;
    if (updates.data !== undefined) dbUpdates.data = updates.data;

    // Sempre atualizar updated_at
    dbUpdates.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from("leads_prospeccao")
      .update(dbUpdates)
      .eq("id", leadId);

    if (error) throw error;

    return { success: true, message: "Lead atualizado com sucesso" };
  } catch (error: unknown) {
    console.error("Erro ao atualizar lead:", error);
    return { success: false, message: (error as Error).message || "Erro ao atualizar lead" };
  }
}

// ============= UPDATE LEAD STATUS =============
export async function updateLeadStatus(
  leadId: string,
  status: LeadStatus
): Promise<{ success: boolean; message: string }> {
  try {
    // Atualizar ambos status e estagio_pipeline para sincronizar CRM e Kanban
    const { error } = await supabase
      .from("leads_prospeccao")
      .update({
        status: status,
        estagio_pipeline: status,
        updated_at: new Date().toISOString()
      } as Record<string, unknown>)
      .eq("id", leadId);

    if (error) throw error;

    return { success: true, message: `Status atualizado para ${status}` };
  } catch (error: unknown) {
    console.error("Erro ao atualizar status:", error);
    return { success: false, message: (error as Error).message || "Erro ao atualizar status" };
  }
}

// ============= NORMALIZAÇÃO DE TEXTO =============
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^a-z0-9\s]/g, "") // Remove caracteres especiais
    .trim();
}

// ============= VERIFICAR DUPLICATA =============
export async function checkDuplicateLead(
  nome: string,
  whatsapp?: string,
  website?: string
): Promise<{ isDuplicate: boolean; existingLead?: Lead; message: string }> {
  try {
    const normalizedNome = normalizeText(nome);

    // Buscar por WhatsApp (chave primária de unicidade)
    if (whatsapp && whatsapp.trim()) {
      const cleanPhone = whatsapp.replace(/\D/g, "");
      const { data: whatsappMatches } = await supabase
        .from("leads_prospeccao")
        .select("*")
        .or(`whatsapp.ilike.%${cleanPhone}%,telefone.ilike.%${cleanPhone}%`)
        .limit(1);

      if (whatsappMatches && whatsappMatches.length > 0) {
        return {
          isDuplicate: true,
          existingLead: mapRowToLead(whatsappMatches[0]),
          message: "Lead com este telefone/WhatsApp já existe"
        };
      }
    }

    // Buscar por website/domínio
    if (website && website.trim()) {
      const domain = website.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
      const { data: websiteMatches } = await supabase
        .from("leads_prospeccao")
        .select("*")
        .ilike("website", `%${domain}%`)
        .limit(1);

      if (websiteMatches && websiteMatches.length > 0) {
        return {
          isDuplicate: true,
          existingLead: mapRowToLead(websiteMatches[0]),
          message: "Lead com este website já existe"
        };
      }
    }

    // Buscar por nome similar (usando busca textual normalizada)
    const { data: nameMatches } = await supabase
      .from("leads_prospeccao")
      .select("*")
      .or(`lead.ilike.%${normalizedNome}%,empresa.ilike.%${normalizedNome}%`)
      .limit(5);

    if (nameMatches && nameMatches.length > 0) {
      // Verificar similaridade mais estrita
      for (const match of nameMatches) {
        const matchNome = normalizeText(match.lead || "");
        const matchEmpresa = normalizeText(match.empresa || "");

        if (matchNome === normalizedNome || matchEmpresa === normalizedNome) {
          return {
            isDuplicate: true,
            existingLead: mapRowToLead(match),
            message: "Lead com nome similar já existe"
          };
        }
      }
    }

    return { isDuplicate: false, message: "Lead único" };
  } catch (error) {
    console.error("Erro ao verificar duplicata:", error);
    return { isDuplicate: false, message: "Erro na verificação" };
  }
}

// ============= MESCLAR LEADS =============
export async function mergeLeads(
  keepLeadId: string,
  mergeLeadId: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Buscar dados dos dois leads
    const { data: leads, error: fetchError } = await supabase
      .from("leads_prospeccao")
      .select("*")
      .in("id", [keepLeadId, mergeLeadId]);

    if (fetchError || !leads || leads.length !== 2) {
      return { success: false, message: "Não foi possível encontrar os leads para mesclar" };
    }

    const keepLead = leads.find(l => l.id === keepLeadId) as SupabaseLeadRow | undefined;
    const mergeLead = leads.find(l => l.id === mergeLeadId) as SupabaseLeadRow | undefined;

    if (!keepLead || !mergeLead) {
      return { success: false, message: "Leads não encontrados" };
    }

    // Mesclar dados (priorizar dados do lead que será mantido)
    const mergedData = {
      lead: keepLead.lead || mergeLead.lead,
      empresa: keepLead.empresa || mergeLead.empresa,
      categoria: keepLead.categoria || mergeLead.categoria,
      contato: keepLead.contato || mergeLead.contato,
      whatsapp: keepLead.whatsapp || mergeLead.whatsapp,
      telefone: keepLead.telefone || mergeLead.telefone,
      email: keepLead.email || mergeLead.email,
      website: keepLead.website || mergeLead.website,
      instagram: keepLead.instagram || mergeLead.instagram,
      cidade: keepLead.cidade || mergeLead.cidade,
      endereco: keepLead.endereco || mergeLead.endereco,
      bairro_regiao: keepLead.bairro_regiao || mergeLead.bairro_regiao,
      link_gmn: keepLead.link_gmn || mergeLead.link_gmn,
      resumo_analitico: keepLead.resumo_analitico || mergeLead.resumo_analitico,
      updated_at: new Date().toISOString()
    };

    // Atualizar lead principal
    const { error: updateError } = await supabase
      .from("leads_prospeccao")
      .update(mergedData as Record<string, unknown>)
      .eq("id", keepLeadId);

    if (updateError) throw updateError;

    // Deletar lead mesclado
    const { error: deleteError } = await supabase
      .from("leads_prospeccao")
      .delete()
      .eq("id", mergeLeadId);

    if (deleteError) throw deleteError;

    return { success: true, message: "Leads mesclados com sucesso" };
  } catch (error) {
    console.error("Erro ao mesclar leads:", error);
    return { success: false, message: (error as Error).message };
  }
}

// ============= LIMPAR HISTÓRICO DO LEAD =============
export async function clearLeadHistory(
  leadId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const { error } = await supabase
      .from("leads_prospeccao")
      .update({
        mensagem_whatsapp: null,
        status_msg_wa: WHATSAPP_STATUS.NOT_SENT,
        data_envio_wa: null,
        resumo_analitico: null,
        updated_at: new Date().toISOString()
      } as Record<string, unknown>)
      .eq("id", leadId);

    if (error) throw error;

    return { success: true, message: "Histórico do lead limpo com sucesso" };
  } catch (error) {
    console.error("Erro ao limpar histórico:", error);
    return { success: false, message: (error as Error).message };
  }
}

// Helper para mapear row do banco para Lead
function mapRowToLead(row: SupabaseLeadRow): Lead {
  return {
    id: row.id,
    lead: row.lead || "",
    status: (row.status || LEAD_STATUS.NOVO) as LeadStatus,
    data: row.data || "",
    empresa: row.empresa || "",
    categoria: row.categoria || "",
    contato: row.contato || "",
    whatsapp: row.whatsapp || "",
    telefone: row.telefone || "",
    email: row.email || "",
    website: row.website || "",
    instagram: row.instagram || "",
    cidade: row.cidade || "",
    endereco: row.endereco || "",
    bairro: row.bairro || "",
    bairroRegiao: row.bairro_regiao || "",
    linkGMN: row.link_gmn || "",
    aceitaCartao: row.aceita_cartao || "",
    cnpj: row.cnpj || "",
    mensagemWhatsApp: row.mensagem_whatsapp || "",
    statusMsgWA: (row.status_msg_wa || WHATSAPP_STATUS.NOT_SENT) as WhatsAppStatus,
    dataEnvioWA: row.data_envio_wa || null,
    resumoAnalitico: row.resumo_analitico || "",
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
    origem: LEAD_ORIGIN.PROSPECCAO_ATIVA,
    prioridade: LEAD_PRIORITY.MEDIA,
    regiao: row.cidade || "",
    segmento: row.categoria || "",
    ticketMedioEstimado: 0,
    contatoPrincipal: row.contato || "",
    dataContato: row.created_at || new Date().toISOString(),
    observacoes: "",
  };
}

// ============= CREATE LEAD =============
export async function createLead(
  leadData: Omit<Lead, "id">
): Promise<{ success: boolean; leadId?: string; message: string }> {
  try {
    // Verificar duplicata antes de criar
    const duplicateCheck = await checkDuplicateLead(
      leadData.lead || leadData.empresa || "",
      leadData.whatsapp,
      leadData.website
    );

    if (duplicateCheck.isDuplicate) {
      return {
        success: false,
        message: duplicateCheck.message
      };
    }

    const initialStatus = leadData.status || LEAD_STATUS.NOVO_LEAD;

    const { data, error } = await supabase
      .from("leads_prospeccao")
      .insert({
        id: crypto.randomUUID(),
        lead: leadData.lead || "Lead-000",
        status: initialStatus,
        estagio_pipeline: initialStatus, // Sincronizar com Kanban
        empresa: leadData.empresa || "",
        categoria: leadData.categoria,
        contato: leadData.contatoPrincipal,
        whatsapp: leadData.whatsapp,
        telefone: leadData.telefone,
        email: leadData.email,
        cidade: leadData.cidade,
        endereco: leadData.endereco,
        bairro: leadData.bairro,
        bairro_regiao: leadData.bairroRegiao,
        website: leadData.website,
        instagram: leadData.instagram,
        link_gmn: leadData.linkGMN,
        aceita_cartao: leadData.aceitaCartao,
        mensagem_whatsapp: leadData.mensagemWhatsApp || "",
        status_msg_wa: leadData.statusMsgWA || WHATSAPP_STATUS.NOT_SENT,
        resumo_analitico: leadData.resumoAnalitico,
        cnpj: leadData.cnpj,
        data: leadData.data || new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      leadId: data.id,
      message: "Lead criado com sucesso"
    };
  } catch (error: unknown) {
    console.error("Erro ao criar lead:", error);
    return {
      success: false,
      message: (error as Error).message || "Erro ao criar lead"
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
      'Fechado': 0,
      'Follow-up': 0,
    };

    const originCounts: Record<string, number> = {};
    let totalValue = 0;
    let whatsappSent = 0;

    leads?.forEach((lead: SupabaseLeadRow) => {
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
  } catch (error: unknown) {
    console.error("Erro ao calcular métricas:", error);
    return {
      success: false,
      message: (error as Error).message || "Erro ao calcular métricas"
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

    const leads: Lead[] = (data || []).map((row: SupabaseLeadRow) => ({
      id: row.id,
      lead: row.lead || "",
      status: (row.status || LEAD_STATUS.NOVO_LEAD) as LeadStatus,
      empresa: row.empresa || "",
      categoria: row.categoria || "",
      contato: row.contato || "",
      whatsapp: row.whatsapp || "",
      telefone: row.telefone || "",
      email: row.email || "",
      cidade: row.cidade || "",
      endereco: row.endereco || "",
      bairro: row.bairro || "",
      bairroRegiao: row.bairro_regiao || "",
      website: row.website || "",
      instagram: row.instagram || "",
      linkGMN: row.link_gmn || "",
      aceitaCartao: row.aceita_cartao || "",
      mensagemWhatsApp: row.mensagem_whatsapp || "",
      statusMsgWA: (row.status_msg_wa || WHATSAPP_STATUS.NOT_SENT) as WhatsAppStatus,
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
  } catch (error: unknown) {
    console.error("Erro ao buscar leads para WhatsApp:", error);
    return {
      success: false,
      leads: [],
      message: (error as Error).message || "Erro ao buscar leads"
    };
  }
}

// ============= DELETE LEADS =============
export async function deleteLeads(
  leadIds: string[]
): Promise<{ success: boolean; message: string }> {
  try {
    if (!leadIds || leadIds.length === 0) {
      return { success: false, message: "Nenhum lead selecionado" };
    }

    const { error } = await supabase
      .from("leads_prospeccao")
      .delete()
      .in("id", leadIds);

    if (error) throw error;

    return { success: true, message: `${leadIds.length} leads excluídos com sucesso` };
  } catch (error: unknown) {
    console.error("Erro ao excluir leads:", error);
    return {
      success: false,
      message: (error as Error).message || "Erro ao excluir leads"
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
  deleteLeads,
  checkDuplicateLead,
  mergeLeads,
  clearLeadHistory,
};
