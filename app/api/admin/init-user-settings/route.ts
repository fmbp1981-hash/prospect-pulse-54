/**
 * API: Inicializar user_settings + organização para novo usuário
 *
 * POST /api/admin/init-user-settings
 * Chamado durante o signUp para criar user_settings com role=visualizador e pending_setup=true,
 * e — para signups normais (não o admin da plataforma) — cria uma NOVA organização (empresa)
 * com este usuário como admin dela. Isso é o que garante isolamento completo entre empresas
 * diferentes que adotam o sistema: cada cadastro novo nasce em sua própria organização.
 *
 * Usa service role para contornar RLS (o usuário ainda não tem user_settings/organização no
 * momento do signup, então RLS bloquearia). Rota pública no middleware (o usuário recém-criado
 * ainda não tem user_settings, então a checagem de pending_setup do middleware o redirecionaria
 * para /pending antes desta rota rodar) — por isso o `userId` do corpo é sempre revalidado aqui
 * contra o token de sessão enviado no header Authorization, provando que quem chama é o próprio
 * usuário recém-cadastrado (evita IDOR: sem isso, qualquer chamador anônimo poderia forçar
 * criação de organização/membership para o UUID de outro usuário já existente).
 *
 * Exceção: o email designado como admin recebe role='admin' e pending_setup=false automaticamente,
 * garantindo que o administrador principal sempre tenha acesso completo ao sistema. Esse admin de
 * plataforma não pertence a uma organização (ele opera fora do modelo de empresa-cliente).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = 'fmbp1981@gmail.com';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { userId?: string; companyName?: string };
    const { userId, companyName } = body;

    // Valida formato UUID antes de tocar no banco — evita 500 com payloads maliciosos
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!userId || typeof userId !== 'string' || !UUID_REGEX.test(userId)) {
      return NextResponse.json({ error: 'userId must be a valid UUID' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    // Prova de posse: o token do header precisa pertencer ao próprio userId do corpo.
    // Sem isso, esta rota pública seria um IDOR (qualquer um poderia criar organização/
    // membership em nome de outro usuário só sabendo o UUID dele).
    const authHeader = req.headers.get('authorization') ?? '';
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 });
    }

    const callerClient = createClient(supabaseUrl, anonKey);
    const { data: { user: callerUser }, error: callerError } = await callerClient.auth.getUser(accessToken);
    if (callerError || !callerUser || callerUser.id !== userId) {
      return NextResponse.json({ error: 'Token does not match userId' }, { status: 403 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verificar se este userId corresponde ao email do admin
    const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId);
    const isAdminUser = authUser?.email === ADMIN_EMAIL;

    if (isAdminUser) {
      // Admin: forçar role='admin' e pending_setup=false, mesmo que o registro já exista
      const { error } = await supabase
        .from('user_settings')
        .upsert(
          { user_id: userId, role: 'admin', pending_setup: false },
          { onConflict: 'user_id', ignoreDuplicates: false }
        );

      if (error) {
        console.error('[init-user-settings] Erro ao criar/atualizar settings do admin:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      // Usuário comum: criar apenas se não existir — não sobrescreve settings existentes
      const { error } = await supabase
        .from('user_settings')
        .upsert(
          { user_id: userId, role: 'visualizador', pending_setup: true, company_name: companyName ?? null },
          { onConflict: 'user_id', ignoreDuplicates: true }
        );

      if (error) {
        console.error('[init-user-settings] Erro ao criar user_settings:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Cria a organização (empresa) deste cadastro — idempotente: se este usuário já
      // é membro de alguma organização (chamada duplicada da rota), não cria de novo.
      const { data: existingMembership } = await supabase
        .from('organization_members')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (!existingMembership) {
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .insert({ name: companyName?.trim() || 'Minha Empresa' })
          .select('id')
          .single();

        if (orgError) {
          console.error('[init-user-settings] Erro ao criar organização:', orgError);
          return NextResponse.json({ error: orgError.message }, { status: 500 });
        }

        const { error: memberError } = await supabase
          .from('organization_members')
          .insert({ organization_id: org.id, user_id: userId, role: 'admin' });

        if (memberError) {
          console.error('[init-user-settings] Erro ao criar membership:', memberError);
          return NextResponse.json({ error: memberError.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[init-user-settings] Erro inesperado:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
