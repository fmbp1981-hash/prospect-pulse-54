/**
 * POST /api/campaigns/[id]/send
 * Dispara uma campanha para o público selecionado.
 * Suporta canal 'whatsapp' e 'email' (Resend).
 *
 * Canal WhatsApp (Sprint 2b, T5-ISO-02): a organização vem de
 * resolveOrganizationIdForUser(user.id), a campanha tem de ser dela (senão 404)
 * e o envio sai pela conexão de WhatsApp ativa da organização
 * (getWhatsAppForOrganization) — nunca user_settings.evolution_* nem env.
 * Sem conexão → 409 WHATSAPP_NOT_CONFIGURED ANTES de qualquer efeito (campanha
 * não vai para 'running', nenhum envio é registrado). Falhas de envio gravam
 * só o status HTTP ou um motivo genérico em campaign_sends.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireWriter, forbiddenWriterResponse } from '@/lib/auth/require-writer';
import { ConnectionNotConfiguredError } from '@/lib/connectors/types';
import { resolveOrganizationIdForUser, resolveRecordOrganizationId } from '@/lib/connectors/org-context';
import {
  getWhatsAppForOrganization,
  WHATSAPP_NOT_CONFIGURED_ERROR,
  type OrgWhatsApp,
} from '@/lib/integrations/whatsapp/org-whatsapp';

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
  if (!(await requireWriter(user.id))) return forbiddenWriterResponse();

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

  // ─── Pré-validação do canal WhatsApp, antes de qualquer efeito ────────────
  let whatsapp: OrgWhatsApp | null = null;
  let organizationId: string | null = null;
  if (campaign.channel === 'whatsapp') {
    organizationId = await resolveOrganizationIdForUser(user.id);
    if ((await resolveRecordOrganizationId(campaign)) !== organizationId) {
      return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 });
    }
    if (!organizationId) {
      return NextResponse.json({ error: WHATSAPP_NOT_CONFIGURED_ERROR }, { status: 409 });
    }
    try {
      whatsapp = await getWhatsAppForOrganization(organizationId);
    } catch (err) {
      if (err instanceof ConnectionNotConfiguredError) {
        console.warn('[campaigns/send] WhatsApp não configurado', {
          organization_id: organizationId,
          code: 'whatsapp_not_configured',
        });
        return NextResponse.json({ error: WHATSAPP_NOT_CONFIGURED_ERROR }, { status: 409 });
      }
      console.error('[campaigns/send] falha ao resolver conexão', {
        organization_id: organizationId,
        code: 'whatsapp_connection_error',
      });
      return NextResponse.json(
        { error: { code: 'PROVIDER_UNAVAILABLE', message: 'WhatsApp indisponível no momento' } },
        { status: 503 }
      );
    }
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
  if (campaign.channel === 'whatsapp' && whatsapp) {
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < targets.length; i++) {
      const lead = targets[i];
      const recipient = lead.whatsapp!.replace(/\D/g, '');
      const result = await whatsapp.provider.sendText(whatsapp.target, recipient, campaign.body);

      if (result.success) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .from('campaign_sends')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('campaign_id', params.id)
          .eq('lead_id', lead.id);
        sent++;
      } else {
        // Só o status HTTP do provedor é gravado; o resto vira motivo genérico.
        const status = /failed: (\d{3})\b/.exec(result.error ?? '')?.[1];
        const reason = status ? `HTTP ${status}` : 'Falha de comunicação com o provedor de WhatsApp';
        console.error('[campaigns/send] Falha no envio WhatsApp', {
          organization_id: organizationId,
          code: 'whatsapp_send_failed',
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .from('campaign_sends')
          .update({ status: 'failed', error: reason })
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
    // Ler credenciais Resend e from_email do tenant (fallback para env vars)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: emailSettings } = await (db as any)
      .from('user_settings')
      .select('resend_api_key, from_email, company_name')
      .eq('user_id', user.id)
      .single();

    const resendKey = (emailSettings?.resend_api_key as string | null) ?? process.env.RESEND_API_KEY;
    const fromEmailAddr = (emailSettings?.from_email as string | null) ?? process.env.FROM_EMAIL ?? 'noreply@example.com';
    const fromName = (emailSettings?.company_name as string | null) ?? 'LeadFinder Pro';

    if (!resendKey) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any)
        .from('campaigns')
        .update({ status: 'draft', updated_at: new Date().toISOString() })
        .eq('id', params.id);
      return NextResponse.json({ error: 'Chave Resend não configurada. Acesse Configurações → Email para adicionar.' }, { status: 400 });
    }

    const emailTargets = targets.filter(l => l.email?.trim());
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < emailTargets.length; i += EMAIL_BATCH_SIZE) {
      const batch = emailTargets.slice(i, i + EMAIL_BATCH_SIZE);
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
      const logoUrl = appUrl ? `${appUrl}/intellix-logo.png` : '';
      const emails = batch.map(l => ({
        from: `${fromName} <${fromEmailAddr}>`,
        to: [l.email!],
        subject: (campaign.subject ?? '(sem assunto)')
          .replace(/\{\{empresa\}\}/g, l.empresa || '')
          .replace(/\{\{nome\}\}/g, l.email || ''),
        html: campaign.body
          .replace(/\{\{empresa\}\}/g, l.empresa || '')
          .replace(/\{\{nome\}\}/g, l.email || '')
          .replace(/\{\{logo_url\}\}/g, logoUrl),
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
