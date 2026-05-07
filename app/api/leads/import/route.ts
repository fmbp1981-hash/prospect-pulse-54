import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { z } from 'zod';
import type { NormalizedLead, ImportReport, ImportResultRow } from '@/lib/import/types';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NormalizedLeadSchema = z.object({
  empresa: z.string().min(1),
  lead: z.string(),
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

async function findExistingLead(db: ReturnType<typeof createClient>, userId: string, lead: NormalizedLead) {
  if (lead.whatsapp) {
    const digits = lead.whatsapp.replace(/\D/g, '');
    const localDigits = digits.length >= 11 ? digits.slice(-11) : digits.slice(-8);
    const { data } = await (db as any).rpc('find_lead_by_phone_digits', {
      p_digits: localDigits,
      p_user_id: userId,
    });
    if (data?.[0]) return data[0] as { id: string };
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

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const rows: ImportResultRow[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const importId = uuidv4();
  const now = new Date().toISOString();

  const chunks = chunk(leads, 50);

  for (const batch of chunks) {
    for (const lead of batch) {
      try {
        const existing = await findExistingLead(db, user.id, lead);

        if (existing) {
          // Merge: atualiza apenas campos vazios no banco
          const updateFields: Record<string, unknown> = { updated_at: now };
          const fieldsToCheck = [
            'telefone', 'email', 'cidade', 'bairro', 'categoria',
            'cnpj', 'website', 'instagram', 'linkedin', 'resumo_analitico',
          ] as const;

          const { data: current } = await db
            .from('leads_prospeccao')
            .select(fieldsToCheck.join(','))
            .eq('id', existing.id)
            .single();

          for (const field of fieldsToCheck) {
            const currentVal = current?.[field as keyof typeof current];
            const newVal = lead[field as keyof NormalizedLead];
            if (!currentVal && newVal) updateFields[field] = newVal;
          }

          if (Object.keys(updateFields).length > 1) {
            await db.from('leads_prospeccao').update(updateFields).eq('id', existing.id);
          }

          rows.push({ empresa: lead.empresa, status: 'updated' });
          updated++;
        } else {
          const { error: insertErr } = await db.from('leads_prospeccao').insert({
            id: `import-${importId}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
            user_id: user.id,
            empresa: lead.empresa,
            lead: lead.lead || lead.empresa,
            contato: lead.lead || null,
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
          }
        }
      } catch (err) {
        rows.push({ empresa: lead.empresa, status: 'error', reason: String(err) });
        errors++;
      }
    }
  }

  // Audit log
  await db.from('audit_logs').insert({
    user_id: user.id,
    action: 'IMPORT_LEADS',
    details: { created, updated, skipped, errors, importId },
    created_at: now,
  }).catch(() => null);

  const report: ImportReport = { created, updated, skipped, errors, rows, importId };
  return NextResponse.json(report);
}
