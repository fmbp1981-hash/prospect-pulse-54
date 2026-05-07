import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { LEAD_FIELDS, FIELD_DESCRIPTIONS } from '@/lib/import/column-mapper';
import type { ColumnMapping } from '@/lib/import/types';
import { getCurrentOpenAIKey } from '@/lib/ai/openai-key-context';

export const runtime = 'nodejs';
export const maxDuration = 10;

const RequestSchema = z.object({
  columns: z.array(z.string()).min(1).max(100),
  sample: z.array(z.record(z.string())).max(5),
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

  const { columns, sample } = parsed.data;

  const fieldDescriptions = LEAD_FIELDS
    .map(f => `- "${f}": ${FIELD_DESCRIPTIONS[f]}`)
    .join('\n');

  const prompt = `Você é um assistente que mapeia colunas de planilhas para campos de um sistema de CRM.

Campos disponíveis no sistema:
${fieldDescriptions}

Colunas da planilha do usuário: ${JSON.stringify(columns)}

Amostra de dados (até 5 linhas):
${JSON.stringify(sample, null, 2)}

Retorne um JSON com este formato exato:
{
  "mappings": [
    { "sourceColumn": "nome da coluna na planilha", "targetField": "campo do sistema ou null", "confidence": 0.95 }
  ],
  "unmapped": ["colunas que não se encaixam em nenhum campo"]
}

Regras:
- confidence entre 0.0 e 1.0
- Se a coluna não corresponde a nenhum campo, coloque targetField como null e adicione em unmapped
- Não crie campos que não existem na lista
- Analise o conteúdo da amostra para inferir o tipo de dado`;

  try {
    const apiKey = getCurrentOpenAIKey() || process.env.OPENAI_API_KEY!;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      }),
    });

    clearTimeout(timeout);

    if (!aiRes.ok) throw new Error(`OpenAI ${aiRes.status}`);
    const aiJson = await aiRes.json();
    const content = JSON.parse(aiJson.choices[0].message.content);

    // Filtra targetField null e garante que só campos válidos passam
    const validFields = new Set<string>(LEAD_FIELDS);
    const mappings: ColumnMapping[] = (content.mappings ?? [])
      .filter((m: { targetField: string | null }) => m.targetField && validFields.has(m.targetField))
      .map((m: { sourceColumn: string; targetField: string; confidence: number }) => ({
        sourceColumn: m.sourceColumn,
        targetField: m.targetField as typeof LEAD_FIELDS[number],
        confidence: Math.min(1, Math.max(0, m.confidence ?? 0)),
      }));

    const unmapped: string[] = content.unmapped ?? columns.filter(
      (c: string) => !mappings.some((m: ColumnMapping) => m.sourceColumn === c)
    );

    return NextResponse.json({ mappings, unmapped });
  } catch (err) {
    // Timeout ou erro da IA → retorna mapeamento vazio (fallback manual no cliente)
    console.warn('[import/map] AI mapping failed, returning empty:', err);
    return NextResponse.json({ mappings: [], unmapped: columns });
  }
}
