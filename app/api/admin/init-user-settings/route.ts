/**
 * API: Inicializar user_settings + organização para novo usuário
 *
 * POST /api/admin/init-user-settings
 * Chamado durante o signUp para criar user_settings com role=visualizador e pending_setup=true
 * e uma NOVA organização (empresa) com este usuário como admin dela. Isso é o que garante
 * isolamento completo entre empresas diferentes que adotam o sistema: cada cadastro novo nasce
 * em sua própria organização.
 *
 * Organização + membership só são criadas no fluxo de signup (S1-F-02): o usuário NÃO tinha
 * linha em user_settings antes desta chamada E não tem membership. Chamadas repetidas (ou de um
 * usuário já existente, inclusive removido da organização) não criam organização nova.
 *
 * Não há tratamento especial por e-mail (S1-F-04): admin da plataforma é só quem está em
 * public.platform_admins (migration 20261030130000), definido via service_role/SQL.
 *
 * Usa service role para contornar RLS (o usuário ainda não tem user_settings/organização no
 * momento do signup, então RLS bloquearia). Rota pública no middleware (o usuário recém-criado
 * ainda não tem user_settings, então a checagem de pending_setup do middleware o redirecionaria
 * para /pending antes desta rota rodar) — por isso o `userId` do corpo é sempre revalidado aqui
 * contra o token de sessão enviado no header Authorization, provando que quem chama é o próprio
 * usuário recém-cadastrado (evita IDOR: sem isso, qualquer chamador anônimo poderia forçar
 * criação de organização/membership para o UUID de outro usuário já existente).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const { limited } = await checkRateLimit(`init-user-settings:${getClientIp(req)}`);
    if (limited) {
      return NextResponse.json({ error: 'Muitas tentativas. Tente novamente em alguns minutos.' }, { status: 429 });
    }

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

    // Estado prévio: o signup é o ÚNICO caso que cria organização (S1-F-02).
    const { data: existingSettings, error: settingsLookupError } = await supabase
      .from('user_settings')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (settingsLookupError) {
      console.error('[init-user-settings] Erro ao consultar user_settings:', settingsLookupError.message);
      return NextResponse.json({ error: 'Falha ao processar solicitação' }, { status: 500 });
    }

    const { data: existingMembership, error: membershipLookupError } = await supabase
      .from('organization_members')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (membershipLookupError) {
      console.error('[init-user-settings] Erro ao consultar organization_members:', membershipLookupError.message);
      return NextResponse.json({ error: 'Falha ao processar solicitação' }, { status: 500 });
    }

    if (existingSettings) {
      // Usuário já inicializado: nada a fazer (não sobrescreve settings nem cria organização).
      return NextResponse.json({ success: true });
    }

    // Cria user_settings pendente. ON CONFLICT DO NOTHING + RETURNING: só devolve a linha se
    // ESTA chamada a inseriu (outra chamada concorrente pode ter criado antes).
    const { data: insertedSettings, error: insertError } = await supabase
      .from('user_settings')
      .upsert(
        { user_id: userId, role: 'visualizador', pending_setup: true, company_name: companyName ?? null },
        { onConflict: 'user_id', ignoreDuplicates: true }
      )
      .select('user_id');

    if (insertError) {
      console.error('[init-user-settings] Erro ao criar user_settings:', insertError.message);
      return NextResponse.json({ error: 'Falha ao processar solicitação' }, { status: 500 });
    }

    const createdNow = Array.isArray(insertedSettings) && insertedSettings.length > 0;

    if (createdNow && !existingMembership) {
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({ name: companyName?.trim() || 'Minha Empresa' })
        .select('id')
        .single();

      if (orgError || !org) {
        console.error('[init-user-settings] Erro ao criar organização:', orgError?.message ?? 'sem retorno');
        return NextResponse.json({ error: 'Falha ao processar solicitação' }, { status: 500 });
      }

      const { error: memberError } = await supabase
        .from('organization_members')
        .insert({ organization_id: org.id, user_id: userId, role: 'admin' });

      if (memberError) {
        console.error('[init-user-settings] Erro ao criar membership:', memberError.message);
        return NextResponse.json({ error: 'Falha ao processar solicitação' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[init-user-settings] Erro inesperado:', err instanceof Error ? err.message : 'erro');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
