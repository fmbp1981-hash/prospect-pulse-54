/**
 * GET|POST /api/admin/rag-ingest  (Authorization: Bearer CRON_SECRET)
 * Segredo em query string não é aceito (vaza em log/histórico).
 *
 * Ingere os 4 documentos RAG da campanha IntelliX no pgvector.
 * Idempotente — pula docs com filename já existente para o mesmo user_id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type User } from '@supabase/supabase-js';
import { ingestDocument } from '@/lib/ai/rag/rag.service';
import { withOpenAIKey } from '@/lib/ai/openai-key-context';
import { verifyCronRequest } from '@/lib/auth/cron-auth';
import {
  RAG_INST_01_IDENTIDADE_TOM_DE_VOZ as DOC_INST01,
  RAG_INST_02_PRODUTOS_ICP_PERSONAS as DOC_INST02,
  RAG_INST_03_OBJECOES_E_FUNIL as DOC_INST03,
  RAG_LEADS_DOSSIE_INTELLIX as DOC_DOSSIE,
} from '@/lib/ai/rag/intellix-docs';

export const runtime = 'nodejs';
export const maxDuration = 300;

const RAG_DOCS = [
  { filename: 'RAG_INST_01_Identidade_Tom_de_Voz.md',  mimetype: 'text/markdown', content: DOC_INST01 },
  { filename: 'RAG_INST_02_Produtos_ICP_Personas.md',   mimetype: 'text/markdown', content: DOC_INST02 },
  { filename: 'RAG_INST_03_Objecoes_e_Funil.md',        mimetype: 'text/markdown', content: DOC_INST03 },
  { filename: 'RAG_Leads_Dossie_IntelliX.md',           mimetype: 'text/markdown', content: DOC_DOSSIE },
];

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceClient();

  // 1. Resolve user_id via auth admin API (mais robusto que filtrar por company_name)
  const listResult = await supabase.auth.admin.listUsers({ perPage: 1000 });

  if (listResult.error) {
    // S1-F-05: detalhe só no log.
    console.error('[rag-ingest] Falha no auth admin:', listResult.error.message);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Falha ao consultar usuários (ver logs do servidor).' } },
      { status: 500 }
    );
  }

  // Cast explícito: o SDK tipa a rama de sucesso como `{ users: User[] } & Pagination`,
  // mas o narrowing pelo `if (listResult.error)` acima não propaga corretamente para
  // `.data.users` no checker de build do Next — ver CLOUDFLARE_MIGRATION_PLAN.md.
  const users = listResult.data.users as User[];
  const authUser = users.find((u) => u.email === 'contato@intellixai.com.br');

  if (!authUser) {
    return NextResponse.json(
      { error: 'User contato@intellixai.com.br not found in auth.users. Run T1 SQL first.' },
      { status: 404 }
    );
  }

  const userId = authUser.id;

  // 2. Busca user_settings pelo user_id resolvido
  const { data: settingsRow } = await supabase
    .from('user_settings')
    .select('openai_api_key')
    .eq('user_id', userId)
    .single();

  const openaiKey = (settingsRow?.openai_api_key as string | null)
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
        const { chunksCreated } = await ingestDocument(
          userId,
          agentConfigId,
          doc.filename,
          doc.content,
          doc.mimetype
        );

        results.push({ filename: doc.filename, status: 'ok', chunks: chunksCreated });
      } catch (err) {
        console.error(`[rag-ingest] Falha ao ingerir ${doc.filename}:`, err instanceof Error ? err.message : 'erro');
        results.push({ filename: doc.filename, status: 'error', error: 'Falha na ingestão (ver logs do servidor).' });
      }
    }
  });

  const errors = results.filter((r) => r.status === 'error');
  return NextResponse.json(
    { userId, agentConfigId, results },
    { status: errors.length > 0 ? 207 : 200 }
  );
}
