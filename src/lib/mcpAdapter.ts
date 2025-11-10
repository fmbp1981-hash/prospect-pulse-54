/**
 * MCP Adapter - Interface para comunicação com n8n MCP Server
 * Endpoint base: https://n8n.intellixai.com.br/mcp/xpag_banco_dados_wa
 * 
 * O MCP Server expõe tools para:
 * - Google Sheets (get_rows, add_row, update_row)
 * - Evolution API WhatsApp (evo_send_message)
 * - Outras integrações via HTTP Request
 */

const MCP_BASE_URL = "https://n8n.intellixai.com.br/mcp/xpag_banco_dados_wa";
const TIMEOUT_MS = 30000;

interface MCPToolCall {
  tool: string;
  params: Record<string, any>;
}

interface MCPResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Faz chamada a uma tool do MCP Server com timeout de 30s
 */
const callMCPTool = async <T = any>(tool: string, params: any): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  
  try {
    const response = await fetch(MCP_BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, params } as MCPToolCall),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MCP Error ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Timeout: O servidor não respondeu em 30 segundos');
      }
      throw error;
    }
    
    throw new Error('Erro desconhecido ao chamar MCP');
  }
};

/**
 * Chamada GET ao MCP (usado para check de status)
 */
const callMCPGet = async <T = any>(params: Record<string, string>): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  
  try {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`${MCP_BASE_URL}?${queryString}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`MCP GET Error ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Timeout: O servidor não respondeu em 30 segundos');
      }
      throw error;
    }
    
    throw new Error('Erro desconhecido ao chamar MCP GET');
  }
};

/**
 * MCP Tools - Wrappers para as tools disponíveis no n8n MCP Server
 */
export const mcpTools = {
  /**
   * Busca linhas do Google Sheets
   * @param filters - Filtros opcionais (ids, status, etc)
   */
  getRows: async (filters?: Record<string, any>) => {
    return callMCPTool("get_rows", filters || {});
  },
  
  /**
   * Adiciona nova linha ao Google Sheets
   * @param data - Dados do lead/registro
   */
  addRow: async (data: any) => {
    return callMCPTool("add_row", data);
  },
  
  /**
   * Atualiza linha existente no Google Sheets
   * @param leadId - ID do lead a atualizar
   * @param updates - Campos a atualizar (objeto com nome_coluna: valor)
   */
  updateRow: async (leadId: string, updates: Record<string, any>) => {
    return callMCPTool("update_row", { leadId, updates });
  },
  
  /**
   * Envia mensagem WhatsApp via Evolution API
   * @param phone - Número do telefone (formato: 5511999999999)
   * @param message - Texto da mensagem
   */
  sendWhatsApp: async (phone: string, message: string) => {
    return callMCPTool("evo_send_message", { phone, message });
  },
  
  /**
   * Busca status de envio WhatsApp para múltiplos leads
   * Endpoint GET: ?ids=id1,id2,id3
   */
  checkWhatsAppStatus: async (leadIds: string[]) => {
    return callMCPGet({ ids: leadIds.join(",") });
  },
};

/**
 * URL base do MCP para uso externo (se necessário)
 */
export const getMCPBaseUrl = () => MCP_BASE_URL;
