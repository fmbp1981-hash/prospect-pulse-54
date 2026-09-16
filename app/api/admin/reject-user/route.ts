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

    const { data: callerSettings } = await adminClient
      .from('user_settings')
      .select('role')
      .eq('user_id', caller.id)
      .single();

    if (callerSettings?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json() as { userId?: string; reason?: string };
    const { userId } = body;
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
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
