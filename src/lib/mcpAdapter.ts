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

// Controle de inicialização via Promise (SEM flag booleana para evitar race conditions)
let initializationPromise: Promise<void> | null = null;
let initRetryCount = 0;
const MAX_INIT_RETRIES = 3;

/**
 * Parseia resposta no formato Server-Sent Events (SSE)
 * Formato esperado:
 * event: message
 * data: {"jsonrpc":"2.0","result":{...}}
 */
const parseSSEResponse = async (response: Response): Promise<any> => {
  const text = await response.text();
  
  // Dividir por linhas
  const lines = text.split('\n');
  
  // Procurar linha que começa com "data:"
  for (const line of lines) {
    if (line.startsWith('data:')) {
      const jsonText = line.substring(5).trim(); // Remove "data:" e espaços
      return JSON.parse(jsonText);
    }
  }
  
  // Se não encontrou formato SSE, tentar parsear como JSON direto
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Formato de resposta inválido: ${text.substring(0, 100)}`);
  }
};

// Obter URL do MCP (configurável via localStorage)
const getMcpBaseUrl = (): string => {
  return localStorage.getItem("leadfinder_mcp_base_url") || DEFAULT_MCP_BASE_URL;
};

// Inicializar servidor MCP com retry logic
const initializeMCPServer = async (): Promise<void> => {
  // Se já existe uma inicialização em andamento, aguardar ela
  if (initializationPromise) {
    return initializationPromise;
  }
  
  // Criar nova Promise de inicialização
  initializationPromise = (async () => {
    const MCP_BASE_URL = getMcpBaseUrl();
    
    while (initRetryCount < MAX_INIT_RETRIES) {
      try {
        initRetryCount++;
        console.log(`🔄 Tentativa ${initRetryCount}/${MAX_INIT_RETRIES}: Iniciando MCP Server...`);
        
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
        
        const initResult = await parseSSEResponse(initResponse);
        
        if (initResult.error) {
          throw new Error(`MCP Init Error: ${initResult.error.message}`);
        }
        
        console.log("📡 Initialize response received:", initResult);
        
        // CRÍTICO: Aguardar 500ms antes de enviar notifications/initialized (aumentado de 300ms)
        // O servidor MCP precisa processar a inicialização antes de aceitar notificações
        console.log("⏳ Aguardando 500ms antes de enviar notifications/initialized...");
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Passo 2: Enviar notificação de initialized
      const initializedNotification = {
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {}
      };
      
      console.log("📤 Enviando notifications/initialized...");
      const notifyResponse = await fetch(MCP_BASE_URL, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream"
        },
        body: JSON.stringify(initializedNotification)
      });
      
      // Verificar se a notificação foi aceita (CRÍTICO)
      if (!notifyResponse.ok) {
        const errorText = await notifyResponse.text();
        console.error("❌ Notification failed:", notifyResponse.status, errorText);
        throw new Error(`Notifications/initialized failed: ${notifyResponse.status} - ${errorText}`);
      }
      
      console.log("✅ Notifications/initialized enviada com sucesso");
      
      // Aguardar mais 500ms para garantir que o servidor processou completamente
      console.log("⏳ Aguardando 500ms para estabilização do servidor...");
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log("✅ MCP Server initialized successfully");
      
      // Reset retry count on success
      initRetryCount = 0;
      return;
      
      } catch (error) {
        console.error(`❌ Tentativa ${initRetryCount} falhou:`, error);
        
        if (initRetryCount >= MAX_INIT_RETRIES) {
          initializationPromise = null;
          initRetryCount = 0;
          throw new Error(`MCP initialization failed after ${MAX_INIT_RETRIES} attempts: ${error}`);
        }
        
        // Wait before retry with exponential backoff
        const waitTime = 1000 * initRetryCount;
        console.log(`⏳ Aguardando ${waitTime}ms antes de tentar novamente...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    // If we exit the loop without success, throw error
    initializationPromise = null;
    initRetryCount = 0;
    throw new Error("MCP initialization failed after all retries");
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
    
    const jsonRpcResponse = await parseSSEResponse(response);
    
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
  // CRÍTICO: Garantir inicialização também no GET
  console.log("🔍 callMCPGet: Garantindo inicialização do servidor...");
  await initializeMCPServer();
  
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
    
    const jsonRpcResponse = await parseSSEResponse(response);
    
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
  initializationPromise = null;
  console.log("🔄 MCP Server será reinicializado na próxima chamada");
};
