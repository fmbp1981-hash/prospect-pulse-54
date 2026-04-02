import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const RESEND_API_URL = 'https://api.resend.com/emails';
const BATCH_SIZE = 50; // Resend allows up to 100, use 50 for safety

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

    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.FROM_EMAIL || 'noreply@xpag.com.br';

    if (!resendKey) {
      return NextResponse.json({ error: 'RESEND_API_KEY não configurada' }, { status: 500 });
    }

    // Use service role to fetch leads and update status
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: leads, error: fetchError } = await supabase
      .from('leads_prospeccao')
      .select('id, email, empresa, contato')
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

    // Process in batches
    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      const batch = leads.slice(i, i + BATCH_SIZE);

      const batchEmails = batch.map(lead => ({
        from: `XPAG Brasil <${fromEmail}>`,
        to: [lead.email as string],
        subject,
        html: htmlBody
          .replace(/\{\{empresa\}\}/g, lead.empresa || '')
          .replace(/\{\{nome\}\}/g, lead.contato || lead.empresa || ''),
      }));

      try {
        const res = await fetch(`${RESEND_API_URL}/batch`, {
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

          // Update status_email in DB
          await supabase
            .from('leads_prospeccao')
            .update({
              status_email: 'sent',
              data_envio_email: new Date().toISOString(),
            })
            .in('id', successIds);
        } else {
          failed += batch.length;
          // Mark as failed
          await supabase
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
