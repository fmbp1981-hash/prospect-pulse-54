import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import type { Database } from '@/integrations/supabase/types';
import type { NormalizedLead, ImportReport, ImportResultRow } from '@/lib/import/types';

export interface ImportOptions {
  defaultEstagio?: string;
  defaultOrigem?: string;
}

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

export async function runImport(
  userId: string,
  leads: NormalizedLead[],
  options: ImportOptions = {}
): Promise<ImportReport> {
  const estagio = options.defaultEstagio ?? 'Novo';
  const origem = options.defaultOrigem ?? 'importação';
  const importId = uuidv4();
  const now = new Date().toISOString();

  const db = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let leadSeq = await getNextLeadSequence(db, userId);
  const rows: ImportResultRow[] = [];
  let created = 0, updated = 0, skipped = 0, errors = 0;

  for (const batch of chunk(leads, 50)) {
    for (const lead of batch) {
      try {
        const existing = await findExistingLead(db, userId, lead);

        if (existing) {
          const fieldsToCheck = [
            'contato', 'telefone', 'email', 'cidade', 'bairro', 'categoria',
            'cnpj', 'website', 'instagram', 'linkedin', 'resumo_analitico',
          ] as const;

          const updateFields: Record<string, unknown> = { updated_at: now };
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
            rows.push({ empresa: lead.empresa, status: 'updated' });
            updated++;
          } else {
            rows.push({ empresa: lead.empresa, status: 'skipped' });
            skipped++;
          }
        } else {
          const { error: insertErr } = await db.from('leads_prospeccao').insert({
            id: uuidv4(),
            user_id: userId,
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
      user_id: userId,
      action: 'IMPORT_LEADS',
      details: { created, updated, skipped, errors, importId },
      created_at: now,
    });
  } catch { /* non-fatal */ }

  return { created, updated, skipped, errors, rows, importId };
}
