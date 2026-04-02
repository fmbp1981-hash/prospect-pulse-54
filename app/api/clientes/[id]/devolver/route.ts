/**
 * POST /api/clientes/[id]/devolver
 * Devolve um cliente para o funil de leads (reprospecção).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Busca cliente
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cliente, error: cErr } = await (db as any)
    .from('clientes')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (cErr || !cliente) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });

  const now = new Date().toISOString();

  // Cria novo lead a partir do cliente
  const leadId = `reimport-${Date.now()}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: newLead, error: leadErr } = await (db as any)
    .from('leads_prospeccao')
    .insert({
      id: leadId,
      user_id: user.id,
      empresa: cliente.empresa,
      lead: cliente.contato ?? cliente.empresa,
      contato: cliente.contato ?? null,
      whatsapp: cliente.whatsapp ?? cliente.telefone_whatsapp ?? null,
      telefone: cliente.telefone ?? null,
      email: cliente.email ?? null,
      website: cliente.website ?? null,
      instagram: cliente.instagram ?? null,
      cnpj: cliente.cnpj ?? null,
      cidade: cliente.cidade ?? null,
      endereco: cliente.endereco ?? null,
      bairro_regiao: cliente.bairro ?? null,
      categoria: cliente.categoria ?? null,
      aceita_cartao: cliente.aceita_cartao ?? null,
      status: 'Novo Lead',
      estagio_pipeline: 'Novo Lead',
      status_msg_wa: 'not_sent',
      origem: 'Reimportado de Clientes',
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (leadErr) return NextResponse.json({ error: leadErr.message }, { status: 500 });

  // Marca cliente como Reprospectar
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .from('clientes')
    .update({ status: 'Reprospectar', updated_at: now })
    .eq('id', params.id)
    .eq('user_id', user.id);

  // Registra na timeline
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .from('cliente_historico')
    .insert({
      cliente_id: params.id,
      user_id: user.id,
      tipo: 'status_change',
      descricao: 'Cliente devolvido para prospecção ativa',
      metadata: { novo_lead_id: leadId },
      created_at: now,
    });

  return NextResponse.json({ ok: true, leadId: newLead.id });
}
