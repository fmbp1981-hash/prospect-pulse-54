import { ProspectionSearch, Lead, DashboardMetrics, LeadStatus } from "@/types/prospection";

const MCP_WEBHOOK_KEY = "leadfinder_mcp_webhook_url";
const WHATSAPP_WEBHOOK_KEY = "leadfinder_whatsapp_webhook_url";
const SYNC_WEBHOOK_KEY = "leadfinder_sync_webhook_url";

export const n8nMcp = {
  getMcpWebhookUrl: (): string | null => {
    return localStorage.getItem(MCP_WEBHOOK_KEY);
  },

  setMcpWebhookUrl: (url: string): void => {
    localStorage.setItem(MCP_WEBHOOK_KEY, url);
  },

  getWhatsAppWebhookUrl: (): string | null => {
    return localStorage.getItem(WHATSAPP_WEBHOOK_KEY);
  },

  setWhatsAppWebhookUrl: (url: string): void => {
    localStorage.setItem(WHATSAPP_WEBHOOK_KEY, url);
  },

  getSyncWebhookUrl: (): string | null => {
    return localStorage.getItem(SYNC_WEBHOOK_KEY);
  },

  setSyncWebhookUrl: (url: string): void => {
    localStorage.setItem(SYNC_WEBHOOK_KEY, url);
  },

  /**
   * Consulta o status de envio de WhatsApp para múltiplas prospecções
   * Endpoint n8n esperado: GET /check-whatsapp-status?ids=id1,id2,id3
   * Resposta esperada: { "id1": { status: "sent", sentAt: "2024-..." }, "id2": { status: "not_sent" }, ... }
   */
  checkWhatsAppStatus: async (
    prospectionIds: string[]
  ): Promise<Record<string, { status: 'sent' | 'not_sent' | 'failed'; sentAt?: string }>> => {
    const mcpUrl = n8nMcp.getMcpWebhookUrl();
    
    if (!mcpUrl) {
      console.warn("MCP webhook URL not configured");
      return {};
    }

    try {
      const idsParam = prospectionIds.join(",");
      const response = await fetch(`${mcpUrl}?ids=${idsParam}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`MCP request failed: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error checking WhatsApp status:", error);
      return {};
    }
  },

  /**
   * Envia mensagens WhatsApp para múltiplas prospecções selecionadas
   * Endpoint n8n esperado: POST /send-whatsapp
   * Body: { prospections: [{ id, niche, location, quantity, timestamp }] }
   */
  sendWhatsAppMessages: async (
    prospections: ProspectionSearch[]
  ): Promise<{ success: boolean; message: string }> => {
    const whatsappUrl = n8nMcp.getWhatsAppWebhookUrl();

    if (!whatsappUrl) {
      return {
        success: false,
        message: "Webhook WhatsApp não configurado",
      };
    }

    try {
      const response = await fetch(whatsappUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prospections: prospections.map((p) => ({
            id: p.id,
            niche: p.niche,
            location: p.location,
            quantity: p.quantity,
            timestamp: p.timestamp,
          })),
          action: "send_whatsapp",
        }),
      });

      if (!response.ok) {
        throw new Error(`WhatsApp send failed: ${response.status}`);
      }

      return {
        success: true,
        message: "Mensagens enviadas com sucesso",
      };
    } catch (error) {
      console.error("Error sending WhatsApp messages:", error);
      return {
        success: false,
        message: "Erro ao enviar mensagens. Verifique a configuração.",
      };
    }
  },

  /**
   * Sincroniza todos os leads do Google Sheets
   * Endpoint n8n esperado: GET /sync-all-leads
   * Resposta esperada: { leads: Lead[] }
   */
  syncAllLeads: async (): Promise<{
    success: boolean;
    leads: Lead[];
    message?: string;
  }> => {
    const syncUrl = n8nMcp.getSyncWebhookUrl();

    if (!syncUrl) {
      return {
        success: false,
        leads: [],
        message: "Webhook de sincronização não configurado",
      };
    }

    try {
      const response = await fetch(`${syncUrl}/sync-all-leads`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        leads: data.leads || [],
      };
    } catch (error) {
      console.error("Error syncing leads:", error);
      return {
        success: false,
        leads: [],
        message: "Erro ao sincronizar com Google Sheets",
      };
    }
  },

  /**
   * Atualiza o status de um lead no Google Sheets
   * Endpoint n8n esperado: PATCH /update-lead-status
   * Body: { leadId: string, status: LeadStatus }
   */
  updateLeadStatus: async (
    leadId: string,
    status: LeadStatus
  ): Promise<{ success: boolean; message: string }> => {
    const syncUrl = n8nMcp.getSyncWebhookUrl();

    if (!syncUrl) {
      return {
        success: false,
        message: "Webhook de sincronização não configurado",
      };
    }

    try {
      const response = await fetch(`${syncUrl}/update-lead-status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leadId,
          status,
        }),
      });

      if (!response.ok) {
        throw new Error(`Update failed: ${response.status}`);
      }

      return {
        success: true,
        message: "Status atualizado com sucesso",
      };
    } catch (error) {
      console.error("Error updating lead status:", error);
      return {
        success: false,
        message: "Erro ao atualizar status",
      };
    }
  },

  /**
   * Atualiza dados completos de um lead no Google Sheets
   * Endpoint n8n esperado: PUT /update-lead/:leadId
   * Body: Partial<Lead>
   */
  updateLead: async (
    leadId: string,
    updates: Partial<Lead>
  ): Promise<{ success: boolean; message: string }> => {
    const syncUrl = n8nMcp.getSyncWebhookUrl();

    if (!syncUrl) {
      return {
        success: false,
        message: "Webhook de sincronização não configurado",
      };
    }

    try {
      const response = await fetch(`${syncUrl}/update-lead/${leadId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error(`Update failed: ${response.status}`);
      }

      return {
        success: true,
        message: "Lead atualizado com sucesso",
      };
    } catch (error) {
      console.error("Error updating lead:", error);
      return {
        success: false,
        message: "Erro ao atualizar lead",
      };
    }
  },

  /**
   * Cria um novo lead no Google Sheets
   * Endpoint n8n esperado: POST /create-lead
   * Body: Omit<Lead, 'id'>
   */
  createLead: async (
    leadData: Omit<Lead, "id">
  ): Promise<{ success: boolean; leadId?: string; message: string }> => {
    const syncUrl = n8nMcp.getSyncWebhookUrl();

    if (!syncUrl) {
      return {
        success: false,
        message: "Webhook de sincronização não configurado",
      };
    }

    try {
      const response = await fetch(`${syncUrl}/create-lead`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(leadData),
      });

      if (!response.ok) {
        throw new Error(`Create failed: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        leadId: data.leadId,
        message: "Lead criado com sucesso",
      };
    } catch (error) {
      console.error("Error creating lead:", error);
      return {
        success: false,
        message: "Erro ao criar lead",
      };
    }
  },

  /**
   * Obtém métricas do dashboard calculadas a partir do Google Sheets
   * Endpoint n8n esperado: GET /metrics
   * Resposta esperada: DashboardMetrics
   */
  getMetrics: async (): Promise<{
    success: boolean;
    metrics?: DashboardMetrics;
    message?: string;
  }> => {
    const syncUrl = n8nMcp.getSyncWebhookUrl();

    if (!syncUrl) {
      return {
        success: false,
        message: "Webhook de sincronização não configurado",
      };
    }

    try {
      const response = await fetch(`${syncUrl}/metrics`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Metrics request failed: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        metrics: data,
      };
    } catch (error) {
      console.error("Error fetching metrics:", error);
      return {
        success: false,
        message: "Erro ao buscar métricas",
      };
    }
  },

  /**
   * Envia mensagens WhatsApp para leads específicos e atualiza Google Sheets
   * Endpoint n8n esperado: POST /send-whatsapp-and-update-sheets
   * Body: { leadIds: string[] }
   */
  sendWhatsAppAndUpdateSheets: async (
    leadIds: string[]
  ): Promise<{
    success: boolean;
    results?: Array<{ id: string; status: string; sentAt?: string }>;
    message: string;
  }> => {
    const whatsappUrl = n8nMcp.getWhatsAppWebhookUrl();

    if (!whatsappUrl) {
      return {
        success: false,
        message: "Webhook WhatsApp não configurado",
      };
    }

    try {
      const response = await fetch(`${whatsappUrl}/send-whatsapp-and-update-sheets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leadIds,
          action: "send_whatsapp",
        }),
      });

      if (!response.ok) {
        throw new Error(`WhatsApp send failed: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        results: data.results,
        message: "Mensagens enviadas e Google Sheets atualizado",
      };
    } catch (error) {
      console.error("Error sending WhatsApp messages:", error);
      return {
        success: false,
        message: "Erro ao enviar mensagens. Verifique a configuração.",
      };
    }
  },
};
