/**
 * API: Excluir manualmente uma conta de usuário pendente/rejeitada
 *
 * POST /api/admin/delete-user
 * Body: { userId: string }
 *
 * Ação destrutiva e definitiva — por isso restrita a contas que NUNCA
 * foram aprovadas (pending_setup=true). Excluir um usuário já aprovado e
 * ativo não é o propósito desta rota (evita remoção acidental de cliente
 * em produção a partir de um clique no painel de pendentes).
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

    const body = await req.json() as { userId?: string };
    const { userId } = body;
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    if (userId === caller.id) {
      return NextResponse.json({ error: 'Não é possível excluir a própria conta por aqui' }, { status: 400 });
    }

    const { data: targetSettings } = await adminClient
      .from('user_settings')
      .select('pending_setup')
      .eq('user_id', userId)
      .single();

    if (!targetSettings || targetSettings.pending_setup !== true) {
      return NextResponse.json(
        { error: 'Só é possível excluir contas ainda não aprovadas' },
        { status: 409 }
      );
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error('[delete-user] Erro ao excluir usuário:', deleteError);
      return NextResponse.json({ error: 'Falha ao processar solicitação' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[delete-user] Erro inesperado:', err);
    return NextResponse.json({ error: 'Falha ao processar solicitação' }, { status: 500 });
  }
}
