/**
 * GET  /api/admin/rag-ingest?secret=CRON_SECRET   ← cole no navegador
 * POST /api/admin/rag-ingest  (Authorization: Bearer CRON_SECRET)
 *
 * Ingere os 4 documentos RAG da campanha IntelliX no pgvector.
 * Idempotente — pula docs com filename já existente para o mesmo user_id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ingestDocument } from '@/lib/ai/rag/rag.service';
import { withOpenAIKey } from '@/lib/ai/openai-key-context';

export const runtime = 'nodejs';
export const maxDuration = 300;

const RAG_DOCS = [
  { filename: 'RAG_INST_01_Identidade_Tom_de_Voz.md',  mimetype: 'text/markdown' },
  { filename: 'RAG_INST_02_Produtos_ICP_Personas.md',   mimetype: 'text/markdown' },
  { filename: 'RAG_INST_03_Objecoes_e_Funil.md',        mimetype: 'text/markdown' },
  { filename: 'RAG_Leads_Dossie_IntelliX.md',           mimetype: 'text/markdown' },
];

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function authorize(req: NextRequest): boolean {
  const CRON_SECRET = process.env.CRON_SECRET;
  if (!CRON_SECRET) return false;
  const header = req.headers.get('authorization');
  if (header === `Bearer ${CRON_SECRET}`) return true;
  const qs = req.nextUrl.searchParams.get('secret');
  return qs === CRON_SECRET;
}

export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceClient();

  // 1. Resolve user_id + openai_api_key via user_settings (company_name = IntelliX.AI)
  const { data: settingsRow, error: settingsErr } = await supabase
    .from('user_settings')
    .select('user_id, openai_api_key')
    .eq('company_name', 'IntelliX.AI')
    .single();

  if (settingsErr || !settingsRow?.user_id) {
    return NextResponse.json(
      { error: 'IntelliX user_settings not found. Run T1 SQL first.' },
      { status: 404 }
    );
  }

  const userId = settingsRow.user_id as string;
  const openaiKey = (settingsRow.openai_api_key as string | null)
    ?? process.env.OPENAI_API_KEY
    ?? '';

  if (!openaiKey) {
    return NextResponse.json(
      { error: 'No OpenAI key found for IntelliX tenant. Set openai_api_key in user_settings.' },
      { status: 422 }
    );
  }

  // 2. Resolve agent_config_id ativo para IntelliX
  const { data: agentRow } = await supabase
    .from('agent_configs')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  const agentConfigId = agentRow?.id as string | undefined;

  if (!agentConfigId) {
    return NextResponse.json(
      { error: 'No active agent_config for IntelliX. Run T5 SQL first.' },
      { status: 404 }
    );
  }

  // 3. Docs já ingeridos (idempotência)
  const { data: existingDocs } = await supabase
    .from('rag_documents')
    .select('filename')
    .eq('user_id', userId)
    .neq('status', 'deleted');

  const alreadyIngested = new Set(
    (existingDocs ?? []).map((d: { filename: string }) => d.filename)
  );

  // 4. Ingere cada doc com a chave OpenAI do tenant
  const results: Array<{
    filename: string;
    status: string;
    chunks?: number;
    error?: string;
  }> = [];

  await withOpenAIKey(openaiKey, async () => {
    for (const doc of RAG_DOCS) {
      if (alreadyIngested.has(doc.filename)) {
        results.push({ filename: doc.filename, status: 'skipped — already ingested' });
        continue;
      }

      try {
        const content = readFileSync(
          join(process.cwd(), 'scripts', 'rag-docs', doc.filename),
          'utf-8'
        );

        const { chunksCreated } = await ingestDocument(
          userId,
          agentConfigId,
          doc.filename,
          content,
          doc.mimetype
        );

        results.push({ filename: doc.filename, status: 'ok', chunks: chunksCreated });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ filename: doc.filename, status: 'error', error: msg });
      }
    }
  });

  const errors = results.filter((r) => r.status === 'error');
  return NextResponse.json(
    { userId, agentConfigId, results },
    { status: errors.length > 0 ? 207 : 200 }
  );
}
