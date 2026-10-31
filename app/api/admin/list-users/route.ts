/**
 * API: Listar usuários com email (admin only)
 *
 * GET /api/admin/list-users
 *
 * Usa service role para acessar auth.users e juntar com user_settings.
 * Retorna email, nome, role, status de pending para cada usuário.
 * Autenticação: só o admin da PLATAFORMA (public.platform_admins).
 * Não devolve segredos (evolution_api_key, chaves de IA, webhook_token).
 */

import { NextResponse } from 'next/server';
import { createClient as createServiceClient, type User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isPlatformAdmin } from '@/lib/auth/platform-admin';

// Sem segredos: evolution_api_key, chaves de IA e webhook_token ficam de fora.
const LIST_USERS_COLUMNS =
  'user_id, role, pending_setup, rejected, company_name, created_at, integration_configured, user_webhook_url, evolution_api_url, evolution_instance_name, whatsapp_webhook_url' as const;

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

    // 2. Só o admin da PLATAFORMA (public.platform_admins). role='admin' em
    //    user_settings não basta: admin de organização também tem esse role.
    if (!(await isPlatformAdmin(user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 3. Buscar todos os user_settings (sem segredos: chaves de API e webhook_token
    //    nunca saem por esta rota)
    const { data: settings, error: settingsError } = await adminClient
      .from('user_settings')
      .select(LIST_USERS_COLUMNS);

    if (settingsError) {
      console.error('[list-users] Erro ao buscar user_settings:', settingsError);
      return NextResponse.json({ error: 'Falha ao processar solicitação' }, { status: 500 });
    }

    // 4. Buscar emails do auth.users
    const listResult = await adminClient.auth.admin.listUsers({ perPage: 1000 });

    if (listResult.error) {
      console.error('[list-users] Erro ao buscar auth.users:', listResult.error);
      return NextResponse.json({ error: 'Falha ao processar solicitação' }, { status: 500 });
    }

    const authUsers = listResult.data.users as User[];
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
