import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { shouldBlockPendingUser } from './pending-gate';

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const { pathname } = request.nextUrl;

  // Rotas públicas (não requerem autenticação)
  const publicRoutes = ['/login', '/signup', '/forgot-password'];
  // Rotas de API que recebem webhooks externos (Evolution API, cron jobs) — sempre públicas
  // /api/internal/ é chamada pelo próprio Worker (consumidor da fila) sem sessão; cada rota
  // exige Authorization: Bearer <CRON_SECRET> (verifyCronRequest).
  // /api/admin/init-user-settings também precisa ser pública: é chamada logo após o signUp,
  // antes de existir user_settings para o novo usuário — se não estivesse aqui, a checagem de
  // pending_setup abaixo redirecionaria essa chamada POST para /pending antes de ela rodar,
  // e a organização do novo cadastro nunca seria criada. A rota já valida o UUID do userId e
  // usa service role apenas para upsert mínimo, sem risco de escalada de privilégio.
  const publicApiPrefixes = ['/api/webhooks/', '/api/cron/', '/api/internal/', '/api/leads/import/webhook', '/api/admin/init-user-settings'];
  const isPublicApiRoute = publicApiPrefixes.some(prefix => pathname.startsWith(prefix));
  const isPublicRoute = isPublicApiRoute || publicRoutes.some(route => pathname.startsWith(route));
  // Rota de pending — usuário autenticado mas aguardando aprovação
  const isPendingRoute = pathname.startsWith('/pending');

  // Rotas de API públicas: retornar imediatamente sem chamar Supabase auth.
  // O @supabase/ssr pode gerar respostas inesperadas ao processar requests sem cookies,
  // o que causava redirect de webhooks/crons para /login.
  if (isPublicApiRoute) {
    return NextResponse.next({ request });
  }

  // Se o Supabase não está configurado, redirecionar para login se não é rota pública
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('⚠️ Supabase não configurado no middleware.');

    // Se não é rota pública, redirecionar para login
    if (!isPublicRoute) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    // Se é rota pública, permitir acesso
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Se não está autenticado e tentando acessar rota protegida
  if (!user && !isPublicRoute) {
    // Rotas de API retornam 401 JSON — não redirecionar para HTML
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Se está autenticado e tentando acessar página de login/signup
  if (user && isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // Settings do usuário (pending_setup + role): uma única consulta por requisição,
  // reutilizada pelo gate de pending, pelo RBAC de /integrations e pela rota /pending.
  // Admin é identificado por role (user_settings), nunca por e-mail.
  let settings: { pending_setup: boolean | null; role: string | null } | null = null;
  if (user && !isPublicRoute) {
    const { data } = await supabase
      .from('user_settings')
      .select('pending_setup, role')
      .eq('user_id', user.id)
      .single();
    settings = data;
  }

  const redirectTo = (pathTarget: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathTarget;
    const redirectResponse = NextResponse.redirect(url);
    // Propagar cookies de sessão para não deslogar o usuário
    supabaseResponse.cookies.getAll().forEach(cookie => {
      redirectResponse.cookies.set(cookie.name, cookie.value);
    });
    return redirectResponse;
  };

  // Verificar pending_setup: redirecionar para /pending se necessário (admin por role nunca é bloqueado)
  if (user && !isPublicRoute && !isPendingRoute && shouldBlockPendingUser(settings)) {
    return redirectTo('/pending');
  }

  // RBAC: /integrations é exclusiva para admins — bloquear server-side
  const isIntegrationsRoute = pathname.startsWith('/integrations');
  if (user && isIntegrationsRoute && settings?.role !== 'admin') {
    return redirectTo('/');
  }

  // Admin (role) ou usuário aprovado em /pending → home.
  // Se settings não existe, mantém em /pending para evitar loop com a verificação acima.
  if (user && isPendingRoute && settings && (settings.role === 'admin' || settings.pending_setup === false)) {
    return redirectTo('/');
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
