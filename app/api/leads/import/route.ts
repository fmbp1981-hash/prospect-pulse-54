/**
 * POST /api/leads/import
 * Importa leads em massa a partir de CSV, XLSX, VCF ou TXT.
 * Retorna: { imported, skipped, errors }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { normalizeBRPhone } from '@/lib/normalizePhone';

export const runtime = 'nodejs';

interface RawLead {
  empresa: string;
  contato?: string;
  whatsapp?: string;
  telefone?: string;
  email?: string;
  cidade?: string;
  categoria?: string;
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

function parseCSV(text: string): RawLead[] {
  const { parse } = require('papaparse') as typeof import('papaparse');
  const result = parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim().toLowerCase()
      .replace(/\s+/g, '_')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
  });
  return result.data.map(row => ({
    empresa: row.empresa ?? row.company ?? row.nome ?? '',
    contato: row.contato ?? row.nome ?? row.name ?? '',
    whatsapp: row.whatsapp ?? row.telefone ?? row.phone ?? row.celular ?? '',
    telefone: row.telefone ?? row.phone ?? '',
    email: row.email ?? '',
    cidade: row.cidade ?? row.city ?? '',
    categoria: row.categoria ?? row.category ?? row.nicho ?? '',
  })).filter(l => l.empresa || l.whatsapp || l.contato);
}

async function parseXLSX(buffer: Buffer): Promise<RawLead[]> {
  const ExcelJS = require('exceljs') as typeof import('exceljs');
  const workbook = new ExcelJS.Workbook();
  // Type cast: exceljs types predate Node.js Buffer generics
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const sheet = workbook.worksheets[0];
  const headers: string[] = [];
  const rows: RawLead[] = [];

  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell((cell, colNumber) => {
        headers[colNumber] = normalize(String(cell.value ?? ''));
      });
      return;
    }
    const rowData: Record<string, string> = {};
    row.eachCell((cell, colNumber) => {
      const header = headers[colNumber];
      if (header) rowData[header] = String(cell.value ?? '');
    });
    const key = (k: string): string => {
      const norm = normalize(k);
      for (const h of Object.keys(rowData)) {
        if (h === norm) return rowData[h];
      }
      return '';
    };
    rows.push({
      empresa: key('empresa') || key('company') || key('nome') || '',
      contato: key('contato') || key('nome') || key('name') || '',
      whatsapp: key('whatsapp') || key('telefone') || key('phone') || key('celular') || '',
      telefone: key('telefone') || key('phone') || '',
      email: key('email') || '',
      cidade: key('cidade') || key('city') || '',
      categoria: key('categoria') || key('category') || key('nicho') || '',
    });
  });

  return rows.filter(l => l.empresa || l.whatsapp || l.contato);
}

function parseVCF(text: string): RawLead[] {
  const cards = text.split(/BEGIN:VCARD/i).slice(1);
  return cards.map(card => {
    const getField = (field: string) => {
      const match = card.match(new RegExp(`${field}[^:]*:(.+)`, 'i'));
      return match ? match[1].trim() : '';
    };
    const fullName = getField('FN') || getField('N').split(';').slice(0, 2).reverse().join(' ').trim();
    const tel = getField('TEL;TYPE=WHATSAPP') || getField('TEL;CELL') || getField('TEL;MOBILE') || getField('TEL');
    const org = getField('ORG');
    return {
      empresa: org || fullName,
      contato: fullName || '',
      whatsapp: tel,
      email: getField('EMAIL'),
      categoria: 'Importado VCF',
    };
  }).filter(l => l.contato || l.whatsapp);
}

function parseTXT(text: string): RawLead[] {
  return text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length >= 8)
    .map(line => ({
      empresa: line,
      contato: '',
      whatsapp: line,
      categoria: 'Importado TXT',
    }));
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Arquivo não enviado (campo: file)' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const text = buffer.toString('utf-8');

  let rawLeads: RawLead[] = [];

  if (ext === 'csv' || file.type === 'text/csv') {
    rawLeads = parseCSV(text);
  } else if (ext === 'xlsx' || ext === 'xls') {
    rawLeads = await parseXLSX(buffer);
  } else if (ext === 'vcf') {
    rawLeads = parseVCF(text);
  } else if (ext === 'txt') {
    rawLeads = parseTXT(text);
  } else {
    return NextResponse.json({ error: `Formato não suportado: .${ext}` }, { status: 400 });
  }

  if (rawLeads.length === 0) {
    return NextResponse.json({ error: 'Nenhum dado encontrado no arquivo' }, { status: 400 });
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date().toISOString();
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < rawLeads.length; i++) {
    const raw = rawLeads[i];

    const normalizedPhone = normalizeBRPhone(raw.whatsapp ?? '') ??
      normalizeBRPhone(raw.telefone ?? '') ?? null;

    const empresa = raw.empresa?.trim() || raw.contato?.trim() || normalizedPhone || `Lead-${i + 1}`;

    // Checar duplicata por whatsapp
    if (normalizedPhone) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (db as any)
        .from('leads_prospeccao')
        .select('id')
        .eq('user_id', user.id)
        .or(`whatsapp.eq.${normalizedPhone},telefone.eq.${normalizedPhone}`)
        .limit(1);

      if (existing?.length > 0) {
        skipped++;
        continue;
      }
    }

    const leadId = `import-${Date.now()}-${i}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertErr } = await (db as any)
      .from('leads_prospeccao')
      .insert({
        id: leadId,
        user_id: user.id,
        empresa,
        lead: raw.contato?.trim() || empresa,
        contato: raw.contato?.trim() ?? null,
        whatsapp: normalizedPhone,
        telefone: normalizedPhone,
        email: raw.email?.trim() || null,
        cidade: raw.cidade?.trim() || null,
        categoria: raw.categoria?.trim() || 'Importação Manual',
        status: 'Novo Lead',
        estagio_pipeline: 'Novo Lead',
        status_msg_wa: 'not_sent',
        origem: 'Importação Manual',
        created_at: now,
        updated_at: now,
      });

    if (insertErr) {
      errors.push(`Linha ${i + 1} (${empresa}): ${insertErr.message}`);
    } else {
      imported++;
    }
  }

  return NextResponse.json({ imported, skipped, total: rawLeads.length, errors });
}
