import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const BATCH_SIZE = 50;

export async function POST(req: NextRequest) {
  try {
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

    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Ler credenciais Resend e from_email do tenant (com fallback para env vars)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: settings } = await (db as any)
      .from('user_settings')
      .select('resend_api_key, from_email, company_name')
      .eq('user_id', user.id)
      .single();

    const resendKey = (settings?.resend_api_key as string | null) ?? process.env.RESEND_API_KEY;
    const fromEmailAddr = (settings?.from_email as string | null) ?? process.env.FROM_EMAIL ?? 'noreply@example.com';
    const fromName = (settings?.company_name as string | null) ?? 'LeadFinder Pro';

    if (!resendKey) {
      return NextResponse.json({ error: 'Chave Resend não configurada. Acesse Configurações → Email para adicionar.' }, { status: 500 });
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

      const batchEmails = batch.map(lead => ({
        from: `${fromName} <${fromEmailAddr}>`,
        to: [lead.email as string],
        subject,
        html: htmlBody
          .replace(/\{\{empresa\}\}/g, lead.empresa || '')
          .replace(/\{\{nome\}\}/g, lead.contato || lead.empresa || ''),
      }));

      try {
        const res = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(batchEmails),
        });

        const result = await res.json();

        if (res.ok && result.data) {
          const successIds = batch.map(l => l.id);
          sent += successIds.length;

          await db
            .from('leads_prospeccao')
            .update({
              status_email: 'sent',
              data_envio_email: new Date().toISOString(),
            })
            .in('id', successIds);
        } else {
          failed += batch.length;
          await db
            .from('leads_prospeccao')
            .update({ status_email: 'failed' })
            .in('id', batch.map(l => l.id));
        }
      } catch {
        failed += batch.length;
      }
    }

    return NextResponse.json({ sent, failed, skipped });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
