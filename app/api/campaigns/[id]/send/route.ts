/**
 * POST /api/campaigns/[id]/send
 * Dispara uma campanha para o público selecionado.
 * Suporta canal 'whatsapp' (Evolution API) e 'email' (Resend).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

const DELAY_MS = 2000;
const EMAIL_BATCH_SIZE = 50;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Carrega campanha
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: campaign, error: cErr } = await (db as any)
    .from('campaigns')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (cErr || !campaign) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 });
  if (campaign.status === 'running') return NextResponse.json({ error: 'Campanha já está em execução' }, { status: 409 });
  if (campaign.status === 'completed') return NextResponse.json({ error: 'Campanha já foi concluída' }, { status: 409 });

  // Resolve destinatários via audience_filter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let leadsQuery = (db as any)
    .from('leads_prospeccao')
    .select('id, empresa, whatsapp, telefone, email, estagio_pipeline, categoria, cidade')
    .eq('user_id', user.id);

  const filter = (campaign.audience_filter ?? {}) as Record<string, unknown>;
  if (filter.categoria) leadsQuery = leadsQuery.eq('categoria', filter.categoria);
  if (filter.cidade) leadsQuery = leadsQuery.eq('cidade', filter.cidade);
  if (filter.estagio_pipeline) leadsQuery = leadsQuery.eq('estagio_pipeline', filter.estagio_pipeline);

  const { data: leads } = await leadsQuery;
  const allLeads = (leads ?? []) as Array<{
    id: string; empresa: string; whatsapp?: string; telefone?: string;
    email?: string; estagio_pipeline?: string; categoria?: string; cidade?: string;
  }>;

  // Filtra por canal
  const targets = campaign.channel === 'whatsapp'
    ? allLeads.filter(l => l.whatsapp?.trim())
    : allLeads.filter(l => l.email?.trim());

  if (targets.length === 0) {
    return NextResponse.json({ error: 'Nenhum destinatário válido para esta campanha' }, { status: 400 });
  }

  // Marca como running
  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .from('campaigns')
    .update({ status: 'running', started_at: now, updated_at: now })
    .eq('id', params.id);

  // Insere sends pendentes
  const sendRows = targets.map(l => ({
    campaign_id: params.id,
    user_id: user.id,
    lead_id: l.id,
    recipient: (campaign.channel === 'whatsapp' ? l.whatsapp : l.email) ?? '',
    status: 'pending' as const,
    created_at: now,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('campaign_sends').insert(sendRows);

  // ─── CHANNEL: WhatsApp ───────────────────────────────────────────────────────
  if (campaign.channel === 'whatsapp') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: settings } = await (db as any)
      .from('user_settings')
      .select('evolution_api_url, evolution_api_key, evolution_instance_name')
      .eq('user_id', user.id)
      .single();

    if (!settings?.evolution_api_url || !settings?.evolution_api_key) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any)
        .from('campaigns')
        .update({ status: 'draft', updated_at: new Date().toISOString() })
        .eq('id', params.id);
      return NextResponse.json({ error: 'Evolution API não configurada em Configurações' }, { status: 400 });
    }

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < targets.length; i++) {
      const lead = targets[i];
      const recipient = lead.whatsapp!.replace(/\D/g, '');
      try {
        const res = await fetch(
          `${settings.evolution_api_url}/message/sendText/${settings.evolution_instance_name}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': settings.evolution_api_key,
            },
            body: JSON.stringify({ number: recipient, text: campaign.body }),
          }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .from('campaign_sends')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('campaign_id', params.id)
          .eq('lead_id', lead.id);

        sent++;
      } catch (err) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .from('campaign_sends')
          .update({ status: 'failed', error: String(err) })
          .eq('campaign_id', params.id)
          .eq('lead_id', lead.id);
        failed++;
      }

      if (i < targets.length - 1) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any)
      .from('campaigns')
      .update({ status: 'completed', completed_at: new Date().toISOString(), total_sent: sent, total_failed: failed, updated_at: new Date().toISOString() })
      .eq('id', params.id);

    return NextResponse.json({ ok: true, sent, failed });
  }

  // ─── CHANNEL: Email ──────────────────────────────────────────────────────────
  if (campaign.channel === 'email') {
    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.FROM_EMAIL ?? 'noreply@example.com';

    if (!resendKey) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any)
        .from('campaigns')
        .update({ status: 'draft', updated_at: new Date().toISOString() })
        .eq('id', params.id);
      return NextResponse.json({ error: 'RESEND_API_KEY não configurada' }, { status: 400 });
    }

    const emailTargets = targets.filter(l => l.email?.trim());
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < emailTargets.length; i += EMAIL_BATCH_SIZE) {
      const batch = emailTargets.slice(i, i + EMAIL_BATCH_SIZE);
      const emails = batch.map(l => ({
        from: fromEmail,
        to: [l.email!],
        subject: campaign.subject ?? '(sem assunto)',
        html: campaign.body,
      }));

      try {
        const res = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendKey}`,
          },
          body: JSON.stringify(emails),
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(err);
        }

        const sentAt = new Date().toISOString();
        for (const lead of batch) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (db as any)
            .from('campaign_sends')
            .update({ status: 'sent', sent_at: sentAt })
            .eq('campaign_id', params.id)
            .eq('lead_id', lead.id);
        }
        sent += batch.length;
      } catch (err) {
        for (const lead of batch) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (db as any)
            .from('campaign_sends')
            .update({ status: 'failed', error: String(err) })
            .eq('campaign_id', params.id)
            .eq('lead_id', lead.id);
        }
        failed += batch.length;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any)
      .from('campaigns')
      .update({ status: 'completed', completed_at: new Date().toISOString(), total_sent: sent, total_failed: failed, updated_at: new Date().toISOString() })
      .eq('id', params.id);

    return NextResponse.json({ ok: true, sent, failed });
  }

  return NextResponse.json({ error: 'Canal inválido' }, { status: 400 });
}
