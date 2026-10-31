/**
 * GET    /api/clientes/[id] — detalhes + histórico
 * PATCH  /api/clientes/[id] — atualiza campos (allowlist Zod .strict())
 * DELETE /api/clientes/[id] — remove cliente (soft: status=Inativo)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { clientePatchSchema } from '@/lib/validations/cliente.validation';
import { requireWriter, forbiddenWriterResponse } from '@/lib/auth/require-writer';

export const runtime = 'nodejs';

async function getUser(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** Erro interno: mensagem genérica ao cliente (S1-F-05); detalhe só no log. */
function internalError(message: string) {
  return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message } }, { status: 500 });
}

const service = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = service();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cliente, error } = await (db as any)
    .from('clientes')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (error || !cliente) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: historico } = await (db as any)
    .from('cliente_historico')
    .select('*')
    .eq('cliente_id', params.id)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  return NextResponse.json({ cliente, historico: historico ?? [] });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireWriter(user.id))) return forbiddenWriterResponse();

  // Allowlist (Zod .strict()): user_id, organization_id e colunas internas → 400.
  const parsed = clientePatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Campos inválidos para edição de cliente' }, { status: 400 });
  }
  const update = { ...parsed.data, updated_at: new Date().toISOString() };

  const db = service();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('clientes')
    .update(update)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    console.error('[api/clientes/[id]] Falha ao atualizar cliente:', error.message);
    return internalError('Não foi possível atualizar o cliente.');
  }
  return NextResponse.json({ cliente: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireWriter(user.id))) return forbiddenWriterResponse();

  const db = service();
  // Soft delete — apenas marca como Inativo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('clientes')
    .update({ status: 'Inativo', updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('user_id', user.id);

  if (error) {
    console.error('[api/clientes/[id]] Falha ao inativar cliente:', error.message);
    return internalError('Não foi possível remover o cliente.');
  }
  return NextResponse.json({ ok: true });
}
