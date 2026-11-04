/**
 * POST /api/admin/test-email  (Authorization: Bearer CRON_SECRET)
 * Body: { "to": "email@exemplo.com" }
 *
 * Envia um email de teste com a credencial Resend da PLATAFORMA (IntelliX),
 * a mesma usada nos e-mails de sistema (getPlatformEmailSender).
 * Útil para validar a integração sem precisar disparar uma campanha real.
 *
 * LGPD-S1-01: o destinatário (dado pessoal) vem no corpo, validado por Zod, e
 * não na query string (que fica em logs de acesso e de proxy). GET não existe.
 */
import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';
import { verifyCronRequest } from '@/lib/auth/cron-auth';
import {
  getPlatformEmailSender,
  PlatformEmailNotConfiguredError,
  type EmailSender,
} from '@/lib/connectors/email/get-email-sender';

export const runtime = 'nodejs';

const testEmailSchema = z.object({ to: z.string().trim().max(320).email() }).strict();

export async function POST(req: NextRequest) {
  // Authorization: Bearer <CRON_SECRET> (sem query string; sem CRON_SECRET → 401)
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = testEmailSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Corpo inválido: informe { "to": "<email de destino>" }.' } },
      { status: 400 }
    );
  }
  const { to } = parsed.data;

  let sender: EmailSender;
  try {
    sender = await getPlatformEmailSender();
  } catch (err) {
    if (err instanceof PlatformEmailNotConfiguredError) {
      return NextResponse.json(
        { error: { code: 'PLATFORM_EMAIL_NOT_CONFIGURED', message: 'Credencial de e-mail da plataforma não configurada.' } },
        { status: 422 }
      );
    }
    console.error('[admin/test-email] falha ao resolver credencial da plataforma', {
      code: 'platform_email_error',
    });
    return NextResponse.json(
      { error: { code: 'PROVIDER_UNAVAILABLE', message: 'E-mail indisponível no momento' } },
      { status: 503 }
    );
  }
  const companyName = 'IntelliX.AI';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#0f172a;padding:24px 32px;">
            <span style="color:#fff;font-size:20px;font-weight:700;">IntelliX<span style="color:#6366f1;">.AI</span></span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#0f172a;">✅ Email de teste — LeadFinder Pro</p>
            <p style="margin:0 0 12px;font-size:15px;color:#1e293b;line-height:1.7;">
              Este é um email de <strong>teste</strong> disparado pelo <strong>LeadFinder Pro</strong>
              via integração <strong>Resend</strong>.
            </p>
            <div style="background:#f8fafc;border-left:3px solid #6366f1;border-radius:4px;padding:14px 18px;margin:20px 0;font-size:13px;color:#334155;line-height:1.6;">
              <strong>Remetente:</strong> ${sender.from.replace(/</g, '&lt;')}<br/>
              <strong>Destinatário:</strong> ${to}<br/>
              <strong>Data/Hora:</strong> ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Recife' })} (BRT)
            </div>
            <p style="margin:0;font-size:15px;color:#1e293b;line-height:1.7;">
              Se você recebeu este email, a integração Resend está configurada corretamente
              e pronta para disparos de campanhas. 🎉
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px;"><hr style="border:none;border-top:1px solid #e2e8f0;"/></td>
        </tr>
        <tr>
          <td style="padding:16px 32px 24px;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">
              <strong style="color:#64748b;">Felipe Melo</strong> · IntelliX.AI · contato@intellixai.com.br
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const result = await sender.sendBatch([
    { to, subject: `✅ Teste de email — ${companyName} via LeadFinder Pro`, html },
  ]);

  if (result.sent === 0) {
    return NextResponse.json(
      { error: { code: 'EMAIL_SEND_FAILED', message: 'Falha ao enviar pelo provedor de e-mail.' } },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    messageId: result.ids[0],
    from: sender.from,
    to,
    sentAt: new Date().toISOString(),
  });
}
