/**
 * GET /api/clientes — lista clientes do tenant
 * POST /api/clientes — cria cliente diretamente
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = req.nextUrl.searchParams.get('q') ?? '';
  const status = req.nextUrl.searchParams.get('status') ?? '';
  const categoria = req.nextUrl.searchParams.get('categoria') ?? '';

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (service as any)
    .from('clientes')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (q) {
    query = query.or(`empresa.ilike.%${q}%,contato.ilike.%${q}%,whatsapp.ilike.%${q}%,email.ilike.%${q}%`);
  }
  if (status) query = query.eq('status', status);
  if (categoria) query = query.eq('categoria', categoria);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ clientes: data ?? [] });
}

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  if (!body.empresa?.trim()) {
    return NextResponse.json({ error: 'Campo empresa é obrigatório' }, { status: 400 });
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (service as any)
    .from('clientes')
    .insert({
      user_id: user.id,
      empresa: body.empresa.trim(),
      contato: body.contato ?? null,
      whatsapp: body.whatsapp ?? null,
      telefone: body.telefone ?? null,
      email: body.email ?? null,
      cidade: body.cidade ?? null,
      categoria: body.categoria ?? null,
      origem: body.origem ?? 'Manual',
      status: 'Ativo',
      data_conversao: now,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cliente: data }, { status: 201 });
}
