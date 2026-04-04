/**
 * API: Listar usuários com email (admin only)
 *
 * GET /api/admin/list-users
 *
 * Usa service role para acessar auth.users e juntar com user_settings.
 * Retorna email, nome, role, status de pending para cada usuário.
 * Autenticação: verifica role='admin' no banco — não usa email hardcoded.
 */

import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    // 1. Autenticar via helper compartilhado (trata refresh de sessão corretamente)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
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

    // 2. Verificar role='admin' no banco (não usa email hardcoded)
    const { data: callerSettings } = await adminClient
      .from('user_settings')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (callerSettings?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 3. Buscar todos os user_settings
    const { data: settings, error: settingsError } = await adminClient
      .from('user_settings')
      .select('user_id, role, pending_setup, company_name, created_at, integration_configured, user_webhook_url, evolution_api_url, evolution_api_key, evolution_instance_name, whatsapp_webhook_url');

    if (settingsError) {
      return NextResponse.json({ error: settingsError.message }, { status: 500 });
    }

    // 4. Buscar emails do auth.users
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
