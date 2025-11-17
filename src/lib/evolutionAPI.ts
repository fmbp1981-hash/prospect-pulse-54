/**
 * Evolution API Integration
 * Permite enviar mensagens WhatsApp diretamente sem n8n
 */

export interface EvolutionConfig {
  apiUrl: string;
  instanceName: string;
  apiKey: string;
}

export interface SendMessageParams {
  number: string; // Formato: 5511999999999
  message: string;
  mediaUrl?: string;
}

export interface MessageStatus {
  id: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
}

export class EvolutionAPIService {
  private config: EvolutionConfig;

  constructor(config: EvolutionConfig) {
    this.config = config;
  }

  /**
   * Envia uma mensagem de texto via WhatsApp
   */
  async sendTextMessage(params: SendMessageParams): Promise<MessageStatus> {
    const url = `${this.config.apiUrl}/message/sendText/${this.config.instanceName}`;

    const payload = {
      number: params.number,
      text: params.message,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.config.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Evolution API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return {
      id: data.key?.id || data.messageId || 'unknown',
      status: 'sent',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Envia uma mensagem com mídia (imagem, vídeo, etc)
   */
  async sendMediaMessage(params: SendMessageParams & { mediaUrl: string }): Promise<MessageStatus> {
    const url = `${this.config.apiUrl}/message/sendMedia/${this.config.instanceName}`;

    const payload = {
      number: params.number,
      mediaUrl: params.mediaUrl,
      caption: params.message,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.config.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Evolution API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return {
      id: data.key?.id || data.messageId || 'unknown',
      status: 'sent',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Verifica o status da instância
   */
  async getInstanceStatus(): Promise<{
    instance: string;
    state: 'open' | 'close' | 'connecting';
    qrcode?: string;
  }> {
    const url = `${this.config.apiUrl}/instance/connectionState/${this.config.instanceName}`;

    const response = await fetch(url, {
      headers: {
        'apikey': this.config.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get instance status: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Envia mensagens em massa
   */
  async sendBulkMessages(
    messages: Array<{ number: string; message: string }>
  ): Promise<Array<{ number: string; status: MessageStatus | Error }>> {
    const results = [];

    for (const msg of messages) {
      try {
        const status = await this.sendTextMessage(msg);
        results.push({ number: msg.number, status });

        // Delay entre mensagens para evitar bloqueio
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        results.push({ number: msg.number, status: error as Error });
      }
    }

    return results;
  }
}

/**
 * Hook para usar Evolution API no React
 */
export function useEvolutionAPI(config: EvolutionConfig) {
  const service = new EvolutionAPIService(config);

  return {
    sendMessage: (params: SendMessageParams) => service.sendTextMessage(params),
    sendMediaMessage: (params: SendMessageParams & { mediaUrl: string }) =>
      service.sendMediaMessage(params),
    getStatus: () => service.getInstanceStatus(),
    sendBulk: (messages: Array<{ number: string; message: string }>) =>
      service.sendBulkMessages(messages),
  };
}
