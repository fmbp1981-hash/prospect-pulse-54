import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { z } from 'zod';
import type { Database } from '@/integrations/supabase/types';
import type { NormalizedLead, ImportReport, ImportResultRow } from '@/lib/import/types';
import { v4 as uuidv4 } from 'uuid';

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
  options: z.object({
    defaultEstagio: z.string().default('Novo'),
    defaultOrigem: z.string().default('importação'),
  }).optional(),
});

/** Retorna o próximo número sequencial para Lead-XXX do usuário */
async function getNextLeadSequence(db: SupabaseClient<Database>, userId: string): Promise<number> {
  const { data } = await db
    .from('leads_prospeccao')
    .select('lead')
    .eq('user_id', userId)
    .like('lead', 'Lead-%')
    .order('created_at', { ascending: false })
    .limit(200);

  if (!data || data.length === 0) return 1;

  let max = 0;
  for (const row of data) {
    const match = (row.lead as string)?.match(/^Lead-(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

function formatLeadNumber(seq: number): string {
  return `Lead-${String(seq).padStart(3, '0')}`;
}

async function findExistingLead(db: SupabaseClient<Database>, userId: string, lead: NormalizedLead) {
  if (lead.whatsapp) {
    const { data } = await db
      .from('leads_prospeccao')
      .select('id')
      .eq('user_id', userId)
      .eq('whatsapp', lead.whatsapp)
      .limit(1)
      .maybeSingle();
    if (data) return data as { id: string };
  }
  if (lead.email) {
    const { data } = await db
      .from('leads_prospeccao')
      .select('id')
      .eq('user_id', userId)
      .eq('email', lead.email)
      .limit(1)
      .maybeSingle();
    if (data) return data as { id: string };
  }
  return null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
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
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { leads, options } = parsed.data;
  const estagio = options?.defaultEstagio ?? 'Novo';
  const origem = options?.defaultOrigem ?? 'importação';

  const db = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Busca o próximo número sequencial uma vez antes do loop
  let leadSeq = await getNextLeadSequence(db, user.id);

  const rows: ImportResultRow[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const importId = uuidv4();
  const now = new Date().toISOString();

  for (const batch of chunk(leads, 50)) {
    for (const lead of batch) {
      try {
        const existing = await findExistingLead(db, user.id, lead as unknown as NormalizedLead);

        if (existing) {
          const updateFields: Record<string, unknown> = { updated_at: now };
          const fieldsToCheck = [
            'contato', 'telefone', 'email', 'cidade', 'bairro', 'categoria',
            'cnpj', 'website', 'instagram', 'linkedin', 'resumo_analitico',
          ] as const;

          const { data: current } = await db
            .from('leads_prospeccao')
            .select(fieldsToCheck.join(','))
            .eq('id', existing.id)
            .single();

          for (const field of fieldsToCheck) {
            const currentVal = current?.[field as keyof typeof current];
            const newVal = field === 'contato'
              ? (lead as unknown as NormalizedLead).contato
              : lead[field as keyof typeof lead];
            if (!currentVal && newVal) updateFields[field] = newVal;
          }

          if (Object.keys(updateFields).length > 1) {
            await db.from('leads_prospeccao').update(updateFields).eq('id', existing.id);
            rows.push({ empresa: lead.empresa, status: 'updated' });
            updated++;
          } else {
            rows.push({ empresa: lead.empresa, status: 'skipped' });
            skipped++;
          }
        } else {
          const { error: insertErr } = await db.from('leads_prospeccao').insert({
            user_id: user.id,
            lead: formatLeadNumber(leadSeq),
            empresa: lead.empresa,
            contato: lead.contato || null,
            whatsapp: lead.whatsapp,
            telefone: lead.telefone,
            email: lead.email,
            cidade: lead.cidade,
            bairro: lead.bairro,
            categoria: lead.categoria,
            cnpj: lead.cnpj,
            website: lead.website,
            instagram: lead.instagram,
            linkedin: lead.linkedin,
            resumo_analitico: lead.resumo_analitico,
            status: 'Novo Lead',
            estagio_pipeline: estagio,
            status_msg_wa: 'not_sent',
            modo_atendimento: 'bot',
            origem,
            created_at: now,
            updated_at: now,
          });

          if (insertErr) {
            rows.push({ empresa: lead.empresa, status: 'error', reason: insertErr.message });
            errors++;
          } else {
            rows.push({ empresa: lead.empresa, status: 'created' });
            created++;
            leadSeq++;
          }
        }
      } catch (err) {
        rows.push({ empresa: lead.empresa, status: 'error', reason: String(err) });
        errors++;
      }
    }
  }

  // Audit log — best-effort
  try {
    await (db as SupabaseClient).from('audit_logs').insert({
      user_id: user.id,
      action: 'IMPORT_LEADS',
      details: { created, updated, skipped, errors, importId },
      created_at: now,
    });
  } catch { /* non-fatal */ }

  const report: ImportReport = { created, updated, skipped, errors, rows, importId };
  return NextResponse.json(report);
}
