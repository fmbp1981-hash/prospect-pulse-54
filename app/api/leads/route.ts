import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { normalizeLeadRow } from '@/lib/import/normalizer';

export const runtime = 'nodejs';

const CreateLeadSchema = z.object({
  empresa: z.string().min(1, 'Nome da empresa obrigatório'),
  whatsapp: z.string().min(1, 'WhatsApp obrigatório'),
  lead: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().optional(),
  cidade: z.string().optional(),
  bairro: z.string().optional(),
  categoria: z.string().optional(),
  cnpj: z.string().optional(),
  website: z.string().optional(),
  instagram: z.string().optional(),
  linkedin: z.string().optional(),
  resumo_analitico: z.string().optional(),
});

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
  const parsed = CreateLeadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const normalized = normalizeLeadRow(parsed.data);

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Checar WhatsApp duplicado
  if (normalized.whatsapp) {
    const { data: existing } = await db
      .from('leads_prospeccao')
      .select('id, empresa')
      .eq('user_id', user.id)
      .eq('whatsapp', normalized.whatsapp)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: 'Já existe um lead com esse WhatsApp', existingLead: existing },
        { status: 409 }
      );
    }
  }

  const now = new Date().toISOString();

  const { data, error } = await db.from('leads_prospeccao').insert({
    user_id: user.id,
    empresa: normalized.empresa,
    lead: normalized.lead || normalized.empresa,
    contato: normalized.lead || null,
    whatsapp: normalized.whatsapp,
    telefone: normalized.telefone,
    email: normalized.email,
    cidade: normalized.cidade,
    bairro: normalized.bairro,
    categoria: normalized.categoria,
    cnpj: normalized.cnpj,
    website: normalized.website,
    instagram: normalized.instagram,
    linkedin: normalized.linkedin,
    resumo_analitico: normalized.resumo_analitico,
    status: 'Novo Lead',
    estagio_pipeline: 'Novo',
    status_msg_wa: 'not_sent',
    modo_atendimento: 'bot',
    origem: 'manual',
    created_at: now,
    updated_at: now,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
