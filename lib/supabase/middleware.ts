import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const { pathname } = request.nextUrl;

  // Rotas públicas (não requerem autenticação)
  const publicRoutes = ['/login', '/signup', '/forgot-password'];
  // Rotas de API que recebem webhooks externos (Evolution API, cron jobs) — sempre públicas
  const publicApiPrefixes = ['/api/webhooks/', '/api/cron/', '/api/admin/init-user-settings'];
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

  // Verificar pending_setup: redirecionar para /pending se necessário
  // Admin (email fixo) nunca é redirecionado
  const ADMIN_EMAIL = 'fmbp1981@gmail.com';
  if (user && !isPublicRoute && !isPendingRoute && user.email !== ADMIN_EMAIL) {
    const { data: settings } = await supabase
      .from('user_settings')
      .select('pending_setup')
      .eq('user_id', user.id)
      .single();

    if (settings?.pending_setup === true) {
      const url = request.nextUrl.clone();
      url.pathname = '/pending';
      const redirectResponse = NextResponse.redirect(url);
      // Propagar cookies de sessão para não deslogar o usuário
      supabaseResponse.cookies.getAll().forEach(cookie => {
        redirectResponse.cookies.set(cookie.name, cookie.value);
      });
      return redirectResponse;
    }
  }

  // Se usuário aprovado tenta acessar /pending, redirecionar para home
  if (user && isPendingRoute && user.email !== ADMIN_EMAIL) {
    const { data: settings } = await supabase
      .from('user_settings')
      .select('pending_setup')
      .eq('user_id', user.id)
      .single();

    if (!settings?.pending_setup) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      const redirectResponse = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach(cookie => {
        redirectResponse.cookies.set(cookie.name, cookie.value);
      });
      return redirectResponse;
    }
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
