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
import { z } from 'zod';

const deleteUserSchema = z.object({ userId: z.string().uuid() });

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

    const parsed = deleteUserSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'userId inválido' }, { status: 400 });
    }
    const { userId } = parsed.data;

    if (userId === caller.id) {
      return NextResponse.json({ error: 'Não é possível excluir a própria conta por aqui' }, { status: 400 });
    }

    // Guard atômico: o UPDATE só afeta a linha (e só retorna algo) se
    // pending_setup ainda for true no exato momento da escrita — fecha a
    // janela de corrida entre checar e agir (TOCTOU) que existiria com um
    // SELECT seguido de deleteUser separados.
    const { data: guarded, error: guardError } = await adminClient
      .from('user_settings')
      .update({ updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('pending_setup', true)
      .select('user_id')
      .maybeSingle();

    if (guardError) {
      console.error('[delete-user] Erro no guard de exclusão:', guardError);
      return NextResponse.json({ error: 'Falha ao processar solicitação' }, { status: 500 });
    }

    if (!guarded) {
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
