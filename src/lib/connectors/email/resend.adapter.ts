/**
 * Adaptador Resend (API REST). Recebe a chave e o remetente já resolvidos pela
 * conexão da organização; não lê env nem user_settings.
 *
 * Nunca registra destinatário nem conteúdo: falhas viram só contagem.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export interface EmailSendResult {
  sent: number;
  failed: number;
  ids: string[];
}

export interface EmailSender {
  /** "Nome <email@dominio>" */
  from: string;
  sendBatch(messages: EmailMessage[]): Promise<EmailSendResult>;
}

const RESEND_API = 'https://api.resend.com';
/** Limite do endpoint /emails/batch da Resend. */
const MAX_BATCH = 100;

export function createResendSender(params: { apiKey: string; from: string }): EmailSender {
  const { apiKey, from } = params;

  return {
    from,
    async sendBatch(messages) {
      const result: EmailSendResult = { sent: 0, failed: 0, ids: [] };

      for (let i = 0; i < messages.length; i += MAX_BATCH) {
        const chunk = messages.slice(i, i + MAX_BATCH);
        const body = chunk.map((m) => ({
          from,
          to: [m.to],
          subject: m.subject,
          html: m.html,
          ...(m.replyTo ? { reply_to: m.replyTo } : {}),
        }));

        try {
          const res = await fetch(`${RESEND_API}/emails/batch`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          });
          const json = (await res.json().catch(() => null)) as { data?: Array<{ id?: string }> } | null;
          if (res.ok && json?.data) {
            result.sent += chunk.length;
            for (const item of json.data) if (item.id) result.ids.push(item.id);
          } else {
            result.failed += chunk.length;
          }
        } catch {
          result.failed += chunk.length;
        }
      }

      return result;
    },
  };
}

/** true somente se o domínio existe na conta Resend com status `verified`. */
export async function checkResendDomainVerified(apiKey: string, domain: string): Promise<boolean> {
  try {
    const res = await fetch(`${RESEND_API}/domains`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { data?: Array<{ name?: string; status?: string }> };
    const wanted = domain.trim().toLowerCase();
    return (json.data ?? []).some(
      (d) => d.name?.toLowerCase() === wanted && d.status === 'verified'
    );
  } catch {
    return false;
  }
}
