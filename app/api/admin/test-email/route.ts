/**
 * GET /api/admin/test-email?secret=CRON_SECRET&to=email@exemplo.com
 *
 * Envia um email de teste com as credenciais Resend do tenant IntelliX.
 * Útil para validar a integração sem precisar disparar uma campanha real.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const CRON_SECRET = process.env.CRON_SECRET;
  if (!CRON_SECRET) return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 });

  const secret    = req.nextUrl.searchParams.get('secret');
  const authHeader = req.headers.get('authorization');
  if (secret !== CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const to = req.nextUrl.searchParams.get('to');
  if (!to || !to.includes('@')) {
    return NextResponse.json({ error: 'Parâmetro "to" (email de destino) é obrigatório' }, { status: 400 });
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Busca credenciais do tenant IntelliX
  const { data: { users } } = await db.auth.admin.listUsers({ perPage: 1000 });
  const authUser = users.find(u => u.email === 'contato@intellixai.com.br');
  if (!authUser) return NextResponse.json({ error: 'Tenant IntelliX não encontrado' }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settings } = await (db as any)
    .from('user_settings')
    .select('resend_api_key, from_email, company_name')
    .eq('user_id', authUser.id)
    .single();

  const resendKey   = (settings?.resend_api_key as string | null) ?? process.env.RESEND_API_KEY;
  const fromEmail   = (settings?.from_email    as string | null) ?? 'noreply@example.com';
  const companyName = (settings?.company_name  as string | null) ?? 'IntelliX.AI';

  if (!resendKey) {
    return NextResponse.json({ error: 'resend_api_key não configurada para o tenant IntelliX' }, { status: 422 });
  }

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
              <strong>Tenant:</strong> ${companyName}<br/>
              <strong>Remetente:</strong> ${fromEmail}<br/>
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

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    `${companyName} <${fromEmail}>`,
      to:      [to],
      subject: `✅ Teste de email — ${companyName} via LeadFinder Pro`,
      html,
    }),
  });

  const result = await resendRes.json() as { id?: string; error?: { message: string; name: string } };

  if (!resendRes.ok) {
    return NextResponse.json({ error: result.error?.message ?? 'Erro Resend', detail: result }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    messageId: result.id,
    from: `${companyName} <${fromEmail}>`,
    to,
    sentAt: new Date().toISOString(),
  });
}
