/**
 * Rota temporária para corrigir o registro do admin no user_settings.
 * DELETE este arquivo após usar.
 * GET /api/admin/fix-admin
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = 'fmbp1981@gmail.com';

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Buscar o usuário admin
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    const users = listData?.users ?? [];
    const adminUser = users.find((u: { email?: string | null }) => u.email === ADMIN_EMAIL);
    if (!adminUser) {
      return NextResponse.json({ error: `Usuário ${ADMIN_EMAIL} não encontrado no Auth` }, { status: 404 });
    }

    // Upsert do registro do admin
    const { error: upsertError } = await supabase
      .from('user_settings')
      .upsert(
        { user_id: adminUser.id, role: 'admin', pending_setup: false },
        { onConflict: 'user_id', ignoreDuplicates: false }
      );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    // Verificar resultado
    const { data: settings } = await supabase
      .from('user_settings')
      .select('role, pending_setup')
      .eq('user_id', adminUser.id)
      .single();

    return NextResponse.json({
      success: true,
      message: 'Admin corrigido com sucesso. DELETE este endpoint após confirmar que está funcionando.',
      admin: { id: adminUser.id, email: adminUser.email },
      settings,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
