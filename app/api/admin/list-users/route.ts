/**
 * API: Listar usuários com email (admin only)
 *
 * GET /api/admin/list-users
 *
 * Usa service role para acessar auth.users e juntar com user_settings.
 * Retorna email, nome, role, status de pending para cada usuário.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { ADMIN_EMAIL } from '@/lib/permissions';

export async function GET() {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: settings, error: settingsError } = await adminClient
      .from('user_settings')
      .select('user_id, role, pending_setup, company_name, created_at, integration_configured, user_webhook_url, evolution_api_url, evolution_api_key, evolution_instance_name, whatsapp_webhook_url');

    if (settingsError) {
      return NextResponse.json({ error: settingsError.message }, { status: 500 });
    }

    const { data: { users: authUsers }, error: authError } = await adminClient.auth.admin.listUsers({ perPage: 1000 });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    const authMap = new Map(authUsers.map(u => [u.id, u] as const));

    const usersWithEmail = (settings || []).map((s: Record<string, unknown>) => {
      const authUser = authMap.get(s.user_id as string);
      return {
        ...s,
        email: authUser?.email || 'Email não encontrado',
        full_name: authUser?.user_metadata?.full_name || null,
      };
    });

    return NextResponse.json({ users: usersWithEmail });
  } catch (err) {
    console.error('[list-users] Erro:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
