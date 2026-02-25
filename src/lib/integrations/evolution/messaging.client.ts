/**
 * FLUXO 3B / 4 / 5 - EVOLUTION API MESSAGING CLIENT
 * Equivalente nativo ao node "Enviar texto1" / "Enviar texto2" do n8n.
 * Envia mensagens de texto via WhatsApp usando a Evolution API.
 */

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL!;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY!;

interface SendTextOptions {
  instanceName: string;
  to: string; // número: 5581999999999
  text: string;
  delay?: number; // ms para simular digitação (opcional)
}

interface SendTextResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendWhatsAppText(
  opts: SendTextOptions
): Promise<SendTextResult> {
  const url = `${EVOLUTION_API_URL}/message/sendText/${opts.instanceName}`;

  // Normaliza o número para formato sem + e sem formatação
  const number = opts.to.replace(/\D/g, '');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number,
        text: opts.text,
        delay: opts.delay ?? 0,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const data = (await response.json()) as { key?: { id?: string } };
    return { success: true, messageId: data.key?.id };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Envia sequência de mensagens com delay entre elas.
 * Equivalente ao "Split Out + Loop + Wait_Msg (3s)" do n8n.
 */
export async function sendMessageSequence(
  instanceName: string,
  to: string,
  messages: string[],
  delayMs = 3000
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const text of messages) {
    if (!text.trim()) continue;

    const result = await sendWhatsAppText({ instanceName, to, text });

    if (result.success) {
      sent++;
    } else {
      failed++;
      console.error(`[MessagingClient] Failed to send message to ${to}:`, result.error);
    }

    // Delay entre mensagens (simula digitação humana, igual ao n8n Wait_Msg)
    if (delayMs > 0 && messages.indexOf(text) < messages.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return { sent, failed };
}
