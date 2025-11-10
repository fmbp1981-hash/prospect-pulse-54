/**
 * MCP Adapter - Interface para comunicação com n8n MCP Server
 * Base URL configurável via localStorage (chave: leadfinder_mcp_base_url)
 * Default: https://n8n.intellixai.com.br/mcp/xpag_banco_dados_wa
 */

const DEFAULT_MCP_BASE_URL = "https://n8n.intellixai.com.br/mcp/xpag_banco_dados_wa";
const TIMEOUT_MS = 30000;

// Obter URL do MCP (configurável via localStorage)
const getMcpBaseUrl = (): string => {
  return localStorage.getItem("leadfinder_mcp_base_url") || DEFAULT_MCP_BASE_URL;
};

interface MCPToolCall {
  tool: string;
  params: Record<string, any>;
}

interface MCPResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

const callMCPTool = async <T = any>(tool: string, params: any): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const MCP_BASE_URL = getMcpBaseUrl();
  
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

const callMCPGet = async <T = any>(params: Record<string, string>): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const MCP_BASE_URL = getMcpBaseUrl();
  
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
export const getMCPBaseUrl = () => getMcpBaseUrl();
