import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';
import type { NormalizedLead } from '@/lib/import/types';
import { runImport } from '@/lib/import/import-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NormalizedLeadSchema = z.object({
  empresa: z.string().min(1),
  contato: z.string().nullable(),
  whatsapp: z.string().nullable(),
  telefone: z.string().nullable(),
  email: z.string().nullable(),
  cidade: z.string().nullable(),
  bairro: z.string().nullable(),
  categoria: z.string().nullable(),
  cnpj: z.string().nullable(),
  website: z.string().nullable(),
  instagram: z.string().nullable(),
  linkedin: z.string().nullable(),
  resumo_analitico: z.string().nullable(),
  warnings: z.record(z.string()).optional(),
  errors: z.record(z.string()).optional(),
});

const RequestSchema = z.object({
  leads: z.array(NormalizedLeadSchema).min(1).max(1000),
  filename: z.string().max(255).optional(),
  options: z.object({
    defaultEstagio: z.string().default('Novo'),
    defaultOrigem: z.string().default('importação'),
  }).optional(),
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
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const report = await runImport(
    user.id,
    parsed.data.leads as NormalizedLead[],
    parsed.data.options,
    { source: 'manual', filename: parsed.data.filename }
  );

  return NextResponse.json(report);
}
