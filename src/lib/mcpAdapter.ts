/**
 * MCP Adapter - Interface para comunicação com n8n MCP Server
 * Base URL configurável via localStorage (chave: leadfinder_mcp_base_url)
 * Default: https://n8n.intellixai.com.br/mcp/xpag_banco_dados_wa
 */

const DEFAULT_MCP_BASE_URL = "https://n8n.intellixai.com.br/mcp/xpag_banco_dados_wa";
const TIMEOUT_MS = 30000;

// Contador de IDs para requisições JSON-RPC
let requestIdCounter = 1;
const getNextRequestId = () => requestIdCounter++;

// Flag de inicialização
let isServerInitialized = false;
let initializationPromise: Promise<void> | null = null;

// Obter URL do MCP (configurável via localStorage)
const getMcpBaseUrl = (): string => {
  return localStorage.getItem("leadfinder_mcp_base_url") || DEFAULT_MCP_BASE_URL;
};

// Inicializar servidor MCP
const initializeMCPServer = async (): Promise<void> => {
  if (isServerInitialized) return;
  
  // Se já existe uma inicialização em andamento, aguardar
  if (initializationPromise) {
    return initializationPromise;
  }
  
  initializationPromise = (async () => {
    const MCP_BASE_URL = getMcpBaseUrl();
    
    try {
      // Passo 1: Enviar mensagem de inicialização
      const initRequest = {
        jsonrpc: "2.0",
        id: getNextRequestId(),
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {
            roots: { listChanged: true },
            sampling: {}
          },
          clientInfo: {
            name: "LeadFinder Pro",
            version: "1.0.0"
          }
        }
      };
      
      const initResponse = await fetch(MCP_BASE_URL, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream"
        },
        body: JSON.stringify(initRequest)
      });
      
      if (!initResponse.ok) {
        throw new Error(`Initialization failed: ${initResponse.status}`);
      }
      
      const initResult = await initResponse.json();
      
      if (initResult.error) {
        throw new Error(`MCP Init Error: ${initResult.error.message}`);
      }
      
      // Passo 2: Enviar notificação de initialized
      const initializedNotification = {
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {}
      };
      
      await fetch(MCP_BASE_URL, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream"
        },
        body: JSON.stringify(initializedNotification)
      });
      
      isServerInitialized = true;
      console.log("✅ MCP Server initialized successfully");
      
    } catch (error) {
      initializationPromise = null;
      throw error;
    }
  })();
  
  return initializationPromise;
};

interface MCPToolCall {
  jsonrpc: "2.0";
  id: number;
  method: "tools/call";
  params: {
    name: string;
    arguments: Record<string, any>;
  };
}

interface MCPResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

const callMCPTool = async <T = any>(tool: string, params: any): Promise<T> => {
  // Garantir que o servidor está inicializado antes de fazer a chamada
  await initializeMCPServer();
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const MCP_BASE_URL = getMcpBaseUrl();
  
  // Criar requisição no formato JSON-RPC 2.0
  const requestBody: MCPToolCall = {
    jsonrpc: "2.0",
    id: getNextRequestId(),
    method: "tools/call",
    params: {
      name: tool,
      arguments: params || {}
    }
  };
  
  try {
    const response = await fetch(MCP_BASE_URL, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MCP Error ${response.status}: ${errorText}`);
    }
    
    const jsonRpcResponse = await response.json();
    
    // Extrair dados da resposta JSON-RPC
    if (jsonRpcResponse.error) {
      throw new Error(`MCP Error: ${jsonRpcResponse.error.message}`);
    }
    
    // Resposta MCP vem em result.content[0].text (JSON string)
    if (jsonRpcResponse.result?.content?.[0]?.text) {
      return JSON.parse(jsonRpcResponse.result.content[0].text);
    }
    
    // Fallback para resposta direta
    return jsonRpcResponse.result || jsonRpcResponse;
    
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
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`MCP GET Error ${response.status}`);
    }
    
    const jsonRpcResponse = await response.json();
    
    // Processar resposta JSON-RPC
    if (jsonRpcResponse.error) {
      throw new Error(`MCP Error: ${jsonRpcResponse.error.message}`);
    }
    
    if (jsonRpcResponse.result?.content?.[0]?.text) {
      return JSON.parse(jsonRpcResponse.result.content[0].text);
    }
    
    return jsonRpcResponse.result || jsonRpcResponse;
    
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

/**
 * Força reinicialização do servidor MCP (útil para debug/reconfiguração)
 */
export const reinitializeMCPServer = () => {
  isServerInitialized = false;
  initializationPromise = null;
};
