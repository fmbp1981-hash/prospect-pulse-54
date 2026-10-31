/**
 * API: Aprovar usuário pendente
 *
 * POST /api/admin/approve-user
 * Body: { userId: string, newRole: 'operador' | 'visualizador' }
 *
 * - Só o admin da PLATAFORMA (public.platform_admins) pode aprovar
 * - newRole 'admin' é recusado (400): promoção a admin só por SQL/migration
 * - Atualiza user_settings: role=newRole, pending_setup=false, approved_by=adminId
 * - Envia email de aprovação pelo remetente da plataforma (getPlatformEmailSender)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isPlatformAdmin } from '@/lib/auth/platform-admin';
import { getPlatformEmailSender } from '@/lib/connectors/email/get-email-sender';
import { z } from 'zod';

const approveUserSchema = z.object({
  userId: z.string().uuid(),
  newRole: z.enum(['operador', 'visualizador']),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Autenticar via helper compartilhado (trata refresh de sessão corretamente)
    const supabase = await createClient();
    const { data: { user: caller } } = await supabase.auth.getUser();
    if (!caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'Service role not configured' }, { status: 500 });
    }

    const adminClient = createServiceClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 2. Só o admin da PLATAFORMA (public.platform_admins). role='admin' em
    //    user_settings não basta: admin de organização também tem esse role.
    if (!(await isPlatformAdmin(caller.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 3. Ler body. Aprovação nunca promove a admin: admin da plataforma só por
    //    SQL/migration (platform_admins); admin de organização via organization_members.
    const parsed = approveUserSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'userId (uuid) e newRole (operador | visualizador) são obrigatórios' },
        { status: 400 }
      );
    }
    const { userId, newRole } = parsed.data;

    // 4. Buscar email do usuário a ser aprovado
    const { data: { user: targetUser }, error: userError } = await adminClient.auth.admin.getUserById(userId);
    if (userError || !targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 5. Atualizar user_settings — limpa também um eventual rejected anterior,
    // já que a rejeição é reversível: um usuário rejeitado pode ser aprovado
    // depois (decisão do produto).
    const { error: updateError } = await adminClient
      .from('user_settings')
      .update({
        role: newRole,
        pending_setup: false,
        approved_by: caller.id,
        rejected: false,
        rejected_at: null,
        rejected_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error('[approve-user] Erro ao atualizar user_settings:', updateError);
      return NextResponse.json({ error: 'Falha ao processar solicitação' }, { status: 500 });
    }

    // 6. Enviar email de aprovação (não bloqueia a aprovação)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://alpha.dualite.dev';

    const roleLabels: Record<string, string> = {
      admin: 'Administrador',
      operador: 'Operador',
      visualizador: 'Visualizador',
    };
    const roleLabel = roleLabels[newRole] || newRole;
    const userName = targetUser.user_metadata?.full_name || targetUser.email?.split('@')[0] || 'Usuário';

    if (targetUser.email) {
      try {
        const sender = await getPlatformEmailSender();
        const result = await sender.sendBatch([
          {
            to: targetUser.email,
            subject: 'Seu acesso ao LeadFinder Pro foi aprovado!',
            html: `
              <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
                <div style="margin-bottom: 24px;">
                  <span style="font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">
                    IntelliX<span style="color: #2563eb;">.AI</span>
                  </span>
                </div>
                <h2 style="margin: 0 0 16px;">Acesso aprovado!</h2>
                <p>Olá <strong>${userName}</strong>,</p>
                <p>Sua conta no <strong>LeadFinder Pro</strong> foi aprovada com o perfil <strong>${roleLabel}</strong>.</p>
                <p>Você já pode acessar o sistema clicando no botão abaixo:</p>
                <a href="${appUrl}/login"
                   style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px;
                          border-radius: 6px; text-decoration: none; font-weight: 600; margin: 16px 0;">
                  Acessar LeadFinder Pro
                </a>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
                <p style="color: #6b7280; font-size: 13px; margin: 0;">
                  Este email foi enviado automaticamente pela <strong>IntelliX.AI</strong> — plataforma de inteligência artificial para prospecção e atendimento comercial.
                </p>
              </div>
            `,
          },
        ]);
        if (result.sent === 0) {
          console.warn('[approve-user] Provedor recusou o e-mail de aprovação (não bloqueia aprovação).');
        }
      } catch (emailErr) {
        console.warn('[approve-user] E-mail de aprovação não enviado (não bloqueia aprovação):', {
          reason: emailErr instanceof Error ? emailErr.name : 'erro desconhecido',
        });
      }
    }

    return NextResponse.json({ success: true, email: targetUser.email });
  } catch (err) {
    console.error('[approve-user] Erro inesperado:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
