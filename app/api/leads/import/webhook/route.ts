import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { hashApiKey } from '@/lib/webhook-keys';
import { runImport } from '@/lib/import/import-service';
import type { NormalizedLead } from '@/lib/import/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NormalizedLeadSchema = z.object({
  empresa: z.string().min(1),
  contato: z.string().nullable().default(null),
  whatsapp: z.string().nullable().default(null),
  telefone: z.string().nullable().default(null),
  email: z.string().nullable().default(null),
  cidade: z.string().nullable().default(null),
  bairro: z.string().nullable().default(null),
  categoria: z.string().nullable().default(null),
  cnpj: z.string().nullable().default(null),
  website: z.string().nullable().default(null),
  instagram: z.string().nullable().default(null),
  linkedin: z.string().nullable().default(null),
  resumo_analitico: z.string().nullable().default(null),
  warnings: z.record(z.string()).optional().default({}),
  errors: z.record(z.string()).optional().default({}),
});

const RequestSchema = z.object({
  leads: z.array(NormalizedLeadSchema).min(1).max(1000),
  metadata: z.object({
    source: z.enum(['webhook', 'google_drive']).default('webhook'),
    filename: z.string().max(255).optional(),
  }).optional(),
  options: z.object({
    defaultEstagio: z.string().default('Novo'),
    defaultOrigem: z.string().default('apollo'),
  }).optional(),
});

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey?.startsWith('lpk_')) {
    return NextResponse.json({ error: 'API key inválida ou ausente' }, { status: 401 });
  }

  const keyHash = hashApiKey(apiKey);

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: keyRecord } = await db
    .from('webhook_keys' as never)
    .select('id, user_id')
    .eq('key_hash', keyHash)
    .is('revoked_at', null)
    .maybeSingle() as { data: { id: string; user_id: string } | null };

  if (!keyRecord) {
    return NextResponse.json({ error: 'API key não encontrada ou revogada' }, { status: 401 });
  }

  void (db.from('webhook_keys' as never)
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRecord.id));

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON malformado no corpo da requisição' }, { status: 400 });
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });
  }

  const report = await runImport(
    keyRecord.user_id,
    parsed.data.leads as NormalizedLead[],
    { ...parsed.data.options, defaultOrigem: parsed.data.options?.defaultOrigem ?? 'apollo' },
    {
      source: parsed.data.metadata?.source ?? 'webhook',
      filename: parsed.data.metadata?.filename,
    }
  );

  return NextResponse.json(report);
}
