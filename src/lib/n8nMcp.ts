import { Lead, DashboardMetrics, LeadStatus } from "@/types/prospection";
import { mcpTools } from "./mcpAdapter";

/**
 * Integração simplificada com n8n MCP Server e webhook de prospecção
 * 
 * MCP Base URL: https://n8n.intellixai.com.br/mcp/xpag_banco_dados_wa
 * - Usado para: sync de leads, WhatsApp, métricas (via mcpAdapter)
 * 
 * Prospection Webhook: https://n8n.intellixai.com.br/webhook/xpag_prospecção_Outbound
 * - Usado para: iniciar busca de leads no Google Places
 */

const PROSPECTION_WEBHOOK = "https://n8n.intellixai.com.br/webhook/xpag_prospecção_Outbound";
const TIMEOUT_MS = 30000;

/**
 * Wrapper com timeout para fetch
 */
const fetchWithTimeout = async (url: string, options: RequestInit) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout - servidor não respondeu em 30 segundos');
    }
    throw error;
  }
};

export const n8nMcp = {
  /**
   * Sincroniza todos os leads do Google Sheets via MCP
   * Tool: get_rows (sem filtros = retorna tudo)
   */
  syncAllLeads: async (): Promise<{
    success: boolean;
    leads: Lead[];
    message?: string;
  }> => {
    try {
      const response = await mcpTools.getRows();
      
      return {
        success: true,
        leads: response.leads || response.data || [],
      };
    } catch (error) {
      console.error("Error syncing leads:", error);
      return {
        success: false,
        leads: [],
        message: error instanceof Error ? error.message : "Erro ao sincronizar com Google Sheets",
      };
    }
  },

  /**
   * Atualiza o status de um lead no Google Sheets
   * Tool: update_row
   */
  updateLeadStatus: async (
    leadId: string,
    status: LeadStatus
  ): Promise<{ success: boolean; message: string }> => {
    try {
      await mcpTools.updateRow(leadId, { Status: status });
      
      return {
        success: true,
        message: "Status atualizado com sucesso",
      };
    } catch (error) {
      console.error("Error updating lead status:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Erro ao atualizar status",
      };
    }
  },

  /**
   * Atualiza dados completos de um lead no Google Sheets
   * Tool: update_row
   */
  updateLead: async (
    leadId: string,
    updates: Partial<Lead>
  ): Promise<{ success: boolean; message: string }> => {
    try {
      await mcpTools.updateRow(leadId, updates);
      
      return {
        success: true,
        message: "Lead atualizado com sucesso",
      };
    } catch (error) {
      console.error("Error updating lead:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Erro ao atualizar lead",
      };
    }
  },

  /**
   * Cria um novo lead no Google Sheets
   * Tool: add_row
   */
  createLead: async (
    leadData: Omit<Lead, "id">
  ): Promise<{ success: boolean; leadId?: string; message: string }> => {
    try {
      const response = await mcpTools.addRow(leadData);
      
      return {
        success: true,
        leadId: response.leadId || response.id,
        message: "Lead criado com sucesso",
      };
    } catch (error) {
      console.error("Error creating lead:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Erro ao criar lead",
      };
    }
  },

  /**
   * Obtém métricas do dashboard
   * Tool: get_rows com action: 'metrics'
   */
  getMetrics: async (): Promise<{
    success: boolean;
    metrics?: DashboardMetrics;
    message?: string;
  }> => {
    try {
      const response = await mcpTools.getRows({ action: 'metrics' });
      
      return {
        success: true,
        metrics: response.metrics || response.data,
      };
    } catch (error) {
      console.error("Error fetching metrics:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Erro ao buscar métricas",
      };
    }
  },

  /**
   * NOVO FLUXO: Envia mensagens WhatsApp buscando mensagem do CRM
   * 
   * Processo:
   * 1. Busca dados completos dos leads via get_rows
   * 2. Filtra leads válidos (com mensagem e não enviados)
   * 3. Para cada lead: envia via Evolution API (evo_send_message)
   * 4. Atualiza Google Sheets com status e data de envio (update_row)
   */
  sendWhatsAppAndUpdateSheets: async (
    leadIds: string[]
  ): Promise<{
    success: boolean;
    results?: Array<{ id: string; status: string; sentAt?: string; error?: string }>;
    message: string;
  }> => {
    try {
      // 1. Buscar dados completos dos leads
      const leadsResponse = await mcpTools.getRows({ ids: leadIds.join(",") });
      const leads = leadsResponse.leads || leadsResponse.data || [];
      
      if (leads.length === 0) {
        return {
          success: false,
          message: "Nenhum lead encontrado com os IDs fornecidos",
        };
      }
      
      // 2. Filtrar leads válidos
      const validLeads = leads.filter((lead: Lead) => 
        lead.mensagemWhatsApp && 
        lead.whatsapp &&
        lead.statusMsgWA !== 'sent'
      );
      
      if (validLeads.length === 0) {
        return {
          success: false,
          message: "Nenhum lead válido para envio (sem mensagem configurada ou já enviados)",
        };
      }
      
      // 3. Enviar WhatsApp e atualizar status para cada lead
      const results = [];
      
      for (const lead of validLeads) {
        try {
          // Enviar via Evolution API
          const sendResult = await mcpTools.sendWhatsApp(
            lead.whatsapp, 
            lead.mensagemWhatsApp!
          );
          
          const isSuccess = sendResult.success !== false; // Assume sucesso se não tiver erro explícito
          const timestamp = new Date().toISOString();
          
          // Atualizar Google Sheets
          await mcpTools.updateRow(lead.id, {
            "Status Msg. WA": isSuccess ? "sent" : "failed",
            "Data Envio WA": timestamp,
          });
          
          results.push({
            id: lead.id,
            status: isSuccess ? "sent" : "failed",
            sentAt: timestamp,
          });
          
          // Delay entre envios (rate limiting)
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Erro ao enviar para lead ${lead.id}:`, error);
          
          // Marcar como falha no Google Sheets
          await mcpTools.updateRow(lead.id, {
            "Status Msg. WA": "failed",
            "Data Envio WA": new Date().toISOString(),
          });
          
          results.push({
            id: lead.id,
            status: "failed",
            error: error instanceof Error ? error.message : "Erro desconhecido",
          });
        }
      }
      
      const sentCount = results.filter(r => r.status === "sent").length;
      
      return {
        success: true,
        results,
        message: `${sentCount} mensagem(ns) enviada(s) com sucesso`,
      };
    } catch (error) {
      console.error("Error in sendWhatsAppAndUpdateSheets:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Erro ao enviar mensagens",
      };
    }
  },

  /**
   * Verifica status de envio WhatsApp para múltiplos leads
   * Usado antes de abrir modal de envio
   */
  checkWhatsAppStatus: async (
    leadIds: string[]
  ): Promise<Record<string, { status: 'sent' | 'not_sent' | 'failed'; sentAt?: string }>> => {
    try {
      const response = await mcpTools.checkWhatsAppStatus(leadIds);
      return response;
    } catch (error) {
      console.error("Error checking WhatsApp status:", error);
      return {};
    }
  },

  /**
   * Inicia prospecção de leads no Google Places
   * Usa webhook fixo de prospecção
   */
  startProspection: async (data: {
    niche: string;
    location: any;
    quantity: number;
  }): Promise<{ success: boolean; message: string; totalLeads?: number }> => {
    try {
      const response = await fetchWithTimeout(PROSPECTION_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: data.niche,
          location: data.location,
          quantity: data.quantity,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Prospection failed: ${response.status}`);
      }

      const result = await response.json();
      
      return {
        success: true,
        message: "Prospecção iniciada com sucesso",
        totalLeads: result.totalLeads || result.leads?.length || data.quantity,
      };
    } catch (error) {
      console.error("Error starting prospection:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Erro ao iniciar prospecção",
      };
    }
  },

  /**
   * Retorna URL do webhook de prospecção (para exibição na UI)
   */
  getProspectionWebhook: () => PROSPECTION_WEBHOOK,
};
