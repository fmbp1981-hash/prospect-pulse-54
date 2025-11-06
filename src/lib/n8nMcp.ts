import { ProspectionSearch } from "@/types/prospection";

const MCP_WEBHOOK_KEY = "leadfinder_mcp_webhook_url";
const WHATSAPP_WEBHOOK_KEY = "leadfinder_whatsapp_webhook_url";

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
};
