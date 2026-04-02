/**
 * POST /api/clientes/converter
 * Converte um lead em cliente manualmente.
 * Body: { leadId: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { leadId } = await req.json() as { leadId: string };
  if (!leadId) return NextResponse.json({ error: 'leadId é obrigatório' }, { status: 400 });

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Busca o lead (garantindo ownership)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead, error: leadErr } = await (service as any)
    .from('leads_prospeccao')
    .select('*')
    .eq('id', leadId)
    .eq('user_id', user.id)
    .single();

  if (leadErr || !lead) {
    return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });
  }

  const now = new Date().toISOString();

  // Insere na tabela clientes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cliente, error: clienteErr } = await (service as any)
    .from('clientes')
    .insert({
      user_id: user.id,
      lead_id_original: lead.id,
      empresa: lead.empresa,
      contato: lead.contato ?? lead.lead ?? null,
      whatsapp: lead.whatsapp ?? lead.telefone_whatsapp ?? null,
      telefone: lead.telefone ?? null,
      email: lead.email ?? null,
      website: lead.website ?? null,
      instagram: lead.instagram ?? null,
      cnpj: lead.cnpj ?? null,
      cidade: lead.cidade ?? null,
      endereco: lead.endereco ?? null,
      bairro: lead.bairro ?? lead.bairro_regiao ?? null,
      categoria: lead.categoria ?? null,
      aceita_cartao: lead.aceita_cartao ?? null,
      faturamento_declarado: lead.faturamento_declarado ?? null,
      usa_meios_pagamento: lead.usa_meios_pagamento ?? null,
      status: 'Ativo',
      origem: lead.origem ?? 'Prospecção',
      estagio_origem: lead.estagio_pipeline ?? null,
      data_primeiro_contato: lead.created_at ?? null,
      data_conversao: now,
      consultor_responsavel: lead.consultor_responsavel ?? null,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (clienteErr) {
    return NextResponse.json({ error: clienteErr.message }, { status: 500 });
  }

  // Registra entrada na timeline
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (service as any)
    .from('cliente_historico')
    .insert({
      cliente_id: cliente.id,
      user_id: user.id,
      tipo: 'conversao',
      descricao: `Lead convertido em cliente a partir do estágio "${lead.estagio_pipeline ?? 'N/A'}"`,
      metadata: {
        lead_id: lead.id,
        estagio_pipeline: lead.estagio_pipeline,
        status_msg_wa: lead.status_msg_wa ?? lead.statusMsgWA,
      },
      created_at: now,
    });

  // Remove o lead do funil
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (service as any)
    .from('leads_prospeccao')
    .delete()
    .eq('id', leadId)
    .eq('user_id', user.id);

  return NextResponse.json({ clienteId: cliente.id, cliente }, { status: 201 });
}
