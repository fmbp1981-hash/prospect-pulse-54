/**
 * API: Rejeitar usuário pendente
 *
 * POST /api/admin/reject-user
 * Body: { userId: string, reason?: string }
 *
 * Reversível por design: marca rejected=true mas NÃO deleta a conta nem
 * mexe em role/pending_setup — o admin pode aprovar esse mesmo usuário
 * depois (aprovar limpa o campo rejected). Exclusão definitiva é uma ação
 * separada e explícita (POST /api/admin/delete-user).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isPlatformAdmin } from '@/lib/auth/platform-admin';
import { z } from 'zod';

const rejectUserSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  try {
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

    const parsed = rejectUserSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'userId inválido' }, { status: 400 });
    }
    const { userId } = parsed.data;

    if (userId === caller.id) {
      return NextResponse.json({ error: 'Não é possível rejeitar a própria conta' }, { status: 400 });
    }

    const { error: updateError } = await adminClient
      .from('user_settings')
      .update({
        rejected: true,
        rejected_at: new Date().toISOString(),
        rejected_by: caller.id,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error('[reject-user] Erro ao atualizar user_settings:', updateError);
      return NextResponse.json({ error: 'Falha ao processar solicitação' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[reject-user] Erro inesperado:', err);
    return NextResponse.json({ error: 'Falha ao processar solicitação' }, { status: 500 });
  }
}
