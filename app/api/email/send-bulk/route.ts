import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireWriter, forbiddenWriterResponse } from '@/lib/auth/require-writer';
import { ConnectionNotConfiguredError } from '@/lib/connectors/types';
import { resolveOrganizationIdForUser } from '@/lib/connectors/org-context';
import {
  getEmailSenderForOrganization,
  EMAIL_NOT_CONFIGURED_ERROR,
  type EmailSender,
} from '@/lib/connectors/email/get-email-sender';

const BATCH_SIZE = 50;

export async function POST(req: NextRequest) {
  try {
    // Autenticar usuário para ler configurações do tenant
    const cookieStore = cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    if (!(await requireWriter(user.id))) return forbiddenWriterResponse();

    const { leadIds, subject, htmlBody } = await req.json() as {
      leadIds: string[];
      subject: string;
      htmlBody: string;
    };

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'leadIds deve ser um array não vazio' }, { status: 400 });
    }
    if (!subject?.trim()) {
      return NextResponse.json({ error: 'Assunto é obrigatório' }, { status: 400 });
    }
    if (!htmlBody?.trim()) {
      return NextResponse.json({ error: 'Corpo do email é obrigatório' }, { status: 400 });
    }

    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // E-mail sai pela conexão da organização (domínio do cliente), sem fallback.
    const organizationId = await resolveOrganizationIdForUser(user.id);
    if (!organizationId) {
      return NextResponse.json({ error: EMAIL_NOT_CONFIGURED_ERROR }, { status: 409 });
    }
    let sender: EmailSender;
    try {
      sender = await getEmailSenderForOrganization(organizationId);
    } catch (err) {
      if (err instanceof ConnectionNotConfiguredError) {
        console.warn('[email/send-bulk] e-mail não configurado', {
          organization_id: organizationId,
          code: 'email_not_configured',
        });
        return NextResponse.json({ error: EMAIL_NOT_CONFIGURED_ERROR }, { status: 409 });
      }
      console.error('[email/send-bulk] falha ao resolver conexão', {
        organization_id: organizationId,
        code: 'email_connection_error',
      });
      return NextResponse.json(
        { error: { code: 'PROVIDER_UNAVAILABLE', message: 'E-mail indisponível no momento' } },
        { status: 503 }
      );
    }

    // Buscar leads com email — filtrado ao tenant pelo user_id
    const { data: leads, error: fetchError } = await db
      .from('leads_prospeccao')
      .select('id, email, empresa, contato')
      .eq('user_id', user.id)
      .in('id', leadIds)
      .not('email', 'is', null)
      .not('email', 'eq', '');

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({
        sent: 0,
        failed: 0,
        skipped: leadIds.length,
        message: 'Nenhum lead com email encontrado'
      });
    }

    let sent = 0;
    let failed = 0;
    const skipped = leadIds.length - leads.length;

    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      const batch = leads.slice(i, i + BATCH_SIZE);

      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
      const logoUrl = appUrl ? `${appUrl}/intellix-logo.png` : '';

      const batchEmails = batch.map(lead => ({
        to: lead.email as string,
        subject: subject
          .replace(/\{\{empresa\}\}/g, lead.empresa || '')
          .replace(/\{\{nome\}\}/g, lead.contato || lead.empresa || ''),
        html: htmlBody
          .replace(/\{\{empresa\}\}/g, lead.empresa || '')
          .replace(/\{\{nome\}\}/g, lead.contato || lead.empresa || '')
          .replace(/\{\{logo_url\}\}/g, logoUrl),
      }));

      const result = await sender.sendBatch(batchEmails);
      sent += result.sent;
      failed += result.failed;

      if (result.sent > 0) {
        await db
          .from('leads_prospeccao')
          .update({
            status_email: 'sent',
            data_envio_email: new Date().toISOString(),
          })
          .in('id', batch.map(l => l.id));
      } else {
        await db
          .from('leads_prospeccao')
          .update({ status_email: 'failed' })
          .in('id', batch.map(l => l.id));
      }
    }

    return NextResponse.json({ sent, failed, skipped });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
