/**
 * API: Aprovar usuário pendente
 *
 * POST /api/admin/approve-user
 * Body: { userId: string, newRole: 'operador' | 'visualizador' | 'admin' }
 *
 * - Valida que o solicitante é admin (role=admin + email fmbp1981@gmail.com)
 * - Atualiza user_settings: role=newRole, pending_setup=false, approved_by=adminId
 * - Envia email de aprovação via Resend
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const ADMIN_EMAIL = 'fmbp1981@gmail.com';

async function getCallerUser() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Verificar autenticação do admin
    const caller = await getCallerUser();
    if (!caller || caller.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Verificar role=admin no banco
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: adminSettings } = await adminClient
      .from('user_settings')
      .select('role')
      .eq('user_id', caller.id)
      .single();

    if (adminSettings?.role !== 'admin') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // 2. Ler body
    const body = await req.json() as { userId?: string; newRole?: string };
    const { userId, newRole } = body;

    if (!userId || !newRole) {
      return NextResponse.json({ error: 'userId and newRole are required' }, { status: 400 });
    }

    const validRoles = ['operador', 'visualizador', 'admin'];
    if (!validRoles.includes(newRole)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // 3. Buscar email do usuário a ser aprovado
    const { data: { user: targetUser }, error: userError } = await adminClient.auth.admin.getUserById(userId);
    if (userError || !targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 4. Atualizar user_settings
    const { error: updateError } = await adminClient
      .from('user_settings')
      .update({
        role: newRole,
        pending_setup: false,
        approved_by: caller.id,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error('[approve-user] Erro ao atualizar user_settings:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // 5. Enviar email via Resend
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.FROM_EMAIL || 'noreply@xpag.com.br';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://alpha.dualite.dev';

    const roleLabels: Record<string, string> = {
      admin: 'Administrador',
      operador: 'Operador',
      visualizador: 'Visualizador',
    };
    const roleLabel = roleLabels[newRole] || newRole;
    const userName = targetUser.user_metadata?.full_name || targetUser.email?.split('@')[0] || 'Usuário';

    if (resendApiKey && targetUser.email) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `IntelliX.AI <${fromEmail}>`,
            to: [targetUser.email],
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
          }),
        });
      } catch (emailErr) {
        console.warn('[approve-user] Erro ao enviar email (não bloqueia aprovação):', emailErr);
      }
    } else if (!resendApiKey) {
      console.warn('[approve-user] RESEND_API_KEY não configurada — email não enviado.');
    }

    return NextResponse.json({ success: true, email: targetUser.email });
  } catch (err) {
    console.error('[approve-user] Erro inesperado:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
