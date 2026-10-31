/**
 * RAG SERVICE — Retrieval-Augmented Generation
 *
 * Pipeline:
 * 1. INGESTÃO: Documento → Chunks → Embeddings → Supabase (pgvector)
 * 2. RETRIEVAL: Query → Embedding → Busca semântica → Top-K chunks
 * 3. AUGMENTATION: Chunks relevantes injetados no system prompt
 */

import { createClient } from '@supabase/supabase-js';
import { generateEmbedding, generateEmbeddingsBatch } from './embeddings.service';
import { chunkText } from './chunking';

const TOP_K = 3;            // chunks relevantes por query

interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  similarity?: number;
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── INGESTÃO ────────────────────────────────────────────────────────────────

export async function ingestDocument(
  userId: string,
  agentConfigId: string,
  filename: string,
  content: string,
  mimetype = 'text/plain'
): Promise<{ documentId: string; chunksCreated: number }> {
  const supabase = getServiceClient();

  // 1. Salva documento
  const { data: doc, error: docError } = await supabase
    .from('rag_documents')
    .insert({
      user_id: userId,
      agent_config_id: agentConfigId,
      filename,
      content,
      mimetype,
      status: 'processing',
    })
    .select('id')
    .single();

  if (docError) throw new Error(`Insert document error: ${docError.message}`);
  const documentId = doc.id as string;

  // 2. Chunking
  const chunks = chunkText(content);

  // 3. Embeddings em lote (mais eficiente)
  const embeddings = await generateEmbeddingsBatch(chunks);

  // 4. Salva chunks com vetores
  const chunkRows = chunks.map((chunk, i) => ({
    document_id: documentId,
    user_id: userId,
    content: chunk,
    chunk_index: i,
    embedding: JSON.stringify(embeddings[i]), // pgvector aceita JSON array
  }));

  const { error: chunkError } = await supabase
    .from('rag_document_chunks')
    .insert(chunkRows);

  if (chunkError) {
    await supabase.from('rag_documents').update({ status: 'error' }).eq('id', documentId);
    throw new Error(`Insert chunks error: ${chunkError.message}`);
  }

  // 5. Atualiza status
  await supabase
    .from('rag_documents')
    .update({ status: 'ready', chunk_count: chunks.length })
    .eq('id', documentId);

  return { documentId, chunksCreated: chunks.length };
}

// ─── RETRIEVAL ────────────────────────────────────────────────────────────────

export async function retrieveRelevantChunks(
  query: string,
  userId: string,
  agentConfigId?: string,
  topK = TOP_K
): Promise<DocumentChunk[]> {
  const supabase = getServiceClient();

  // 1. Gera embedding da query
  const queryEmbedding = await generateEmbedding(query);

  // 2. Busca semântica via pgvector (função RPC)
  const { data, error } = await supabase.rpc(
    'match_document_chunks' as never,
    {
      query_embedding: queryEmbedding,
      match_count: topK,
      p_user_id: userId,
      p_agent_config_id: agentConfigId ?? null,
      similarity_threshold: 0.75,
    }
  );

  if (error) {
    console.warn('[RAG] Retrieval error:', error.message);
    return [];
  }

  return ((data ?? []) as Array<{
    id: string;
    document_id: string;
    content: string;
    chunk_index: number;
    similarity: number;
  }>).map((row) => ({
    id: row.id,
    documentId: row.document_id,
    content: row.content,
    chunkIndex: row.chunk_index,
    similarity: row.similarity,
  }));
}

// ─── AUGMENTATION ────────────────────────────────────────────────────────────

/**
 * Gera o bloco de contexto RAG para injetar no system prompt.
 * Retorna string vazia se não houver documentos relevantes.
 */
export async function buildRagContext(
  query: string,
  userId: string,
  agentConfigId?: string
): Promise<string> {
  const chunks = await retrieveRelevantChunks(query, userId, agentConfigId);

  if (chunks.length === 0) return '';

  const contextBlock = chunks
    .map((c, i) => `[Referência ${i + 1}]\n${c.content}`)
    .join('\n\n---\n\n');

  return `\n\n## CONTEXTO DE REFERÊNCIA (Base de Conhecimento)\n\n${contextBlock}\n\nUse essas informações para complementar sua resposta quando relevante.`;
}

// ─── GESTÃO DE DOCUMENTOS ─────────────────────────────────────────────────────

export async function listDocuments(userId: string, agentConfigId?: string) {
  const supabase = getServiceClient();

  let query = supabase
    .from('rag_documents')
    .select('id, filename, mimetype, status, chunk_count, created_at')
    .eq('user_id', userId)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false });

  if (agentConfigId) {
    query = query.eq('agent_config_id', agentConfigId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Remove um documento do usuário. Devolve false quando o documento não existe
 * ou é de outro tenant — nesse caso NADA é apagado (nem os chunks).
 */
export async function deleteDocument(id: string, userId: string): Promise<boolean> {
  const supabase = getServiceClient();

  // Soft delete — mantém histórico. Só conta se a linha é do usuário.
  const { data: deleted, error } = await supabase
    .from('rag_documents')
    .update({ status: 'deleted' })
    .eq('id', id)
    .eq('user_id', userId)
    .select('id');

  if (error) throw new Error(`Delete document error: ${error.message}`);
  if (!deleted || deleted.length === 0) return false;

  // Hard delete dos chunks (economiza espaço), sempre filtrado pelo dono.
  const { error: chunkError } = await supabase
    .from('rag_document_chunks')
    .delete()
    .eq('document_id', id)
    .eq('user_id', userId);

  if (chunkError) throw new Error(`Delete chunks error: ${chunkError.message}`);
  return true;
}

/** true se o agent_config existe e pertence ao usuário. */
export async function isAgentConfigOwnedBy(agentConfigId: string, userId: string): Promise<boolean> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('agent_configs')
    .select('id')
    .eq('id', agentConfigId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`Agent config lookup error: ${error.message}`);
  return Boolean(data);
}
