/**
 * API: Inicializar user_settings para novo usuário
 *
 * POST /api/admin/init-user-settings
 * Chamado durante o signUp para criar user_settings com role=visualizador e pending_setup=true.
 * Usa service role para contornar RLS (o usuário ainda não está autenticado no momento do signup).
 * Esta rota é pública mas só faz upsert com dados mínimos — sem risco de escalada de privilégios.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { userId?: string };
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Upsert: cria apenas se não existir — não sobrescreve settings existentes
    const { error } = await supabase
      .from('user_settings')
      .upsert(
        { user_id: userId, role: 'visualizador', pending_setup: true },
        { onConflict: 'user_id', ignoreDuplicates: true }
      );

    if (error) {
      console.error('[init-user-settings] Erro ao criar user_settings:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[init-user-settings] Erro inesperado:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
