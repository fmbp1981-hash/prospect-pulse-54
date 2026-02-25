/**
 * API: RAG — Gestão de Documentos para Treinamento do Agente
 *
 * GET    /api/agent/rag          — lista documentos
 * POST   /api/agent/rag          — faz upload e ingere documento (multipart/form-data)
 * DELETE /api/agent/rag?id=...   — remove documento
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { ingestDocument, listDocuments, deleteDocument } from '@/lib/ai/rag/rag.service';

const MAX_FILE_SIZE_MB = 10;
const SUPPORTED_TYPES = [
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/json',
];

async function getAuthUser() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ── GET: Lista documentos ─────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const agentConfigId = req.nextUrl.searchParams.get('agent_config_id') ?? undefined;
  const docs = await listDocuments(user.id, agentConfigId);
  return NextResponse.json({ documents: docs });
}

// ── POST: Upload de documento ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const contentType = req.headers.get('content-type') ?? '';

  let filename = 'document.txt';
  let content = '';
  let mimetype = 'text/plain';
  let agentConfigId: string | undefined;

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    agentConfigId = (formData.get('agent_config_id') as string) ?? undefined;

    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return NextResponse.json(
        { error: `File too large. Max: ${MAX_FILE_SIZE_MB}MB` },
        { status: 413 }
      );
    }

    mimetype = file.type || 'text/plain';
    filename = file.name;

    if (!SUPPORTED_TYPES.includes(mimetype) && !mimetype.startsWith('text/')) {
      return NextResponse.json(
        { error: `Unsupported file type: ${mimetype}. Use: txt, md, pdf, json` },
        { status: 400 }
      );
    }

    // Para PDFs: extrai texto via endpoint dedicado (simplificado aqui)
    if (mimetype === 'application/pdf') {
      content = `[PDF: ${filename}]\n\n[Conteúdo extraído automaticamente]\n\n`;
      const arrayBuffer = await file.arrayBuffer();
      // TODO: usar pdf-parse ou similar para extração real
      // Por ora, usa base64 como fallback e deixa o agente processar
      content += Buffer.from(arrayBuffer).toString('base64').slice(0, 50000);
    } else {
      content = await file.text();
    }
  } else {
    // JSON body com conteúdo direto
    const body = await req.json() as {
      filename?: string;
      content?: string;
      agentConfigId?: string;
    };

    if (!body.content?.trim()) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    filename = body.filename ?? 'documento.txt';
    content = body.content;
    agentConfigId = body.agentConfigId;
  }

  try {
    const result = await ingestDocument(
      user.id,
      agentConfigId ?? 'default',
      filename,
      content,
      mimetype
    );

    return NextResponse.json(
      {
        success: true,
        documentId: result.documentId,
        chunksCreated: result.chunksCreated,
        filename,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[RAG] Ingest error:', err);
    return NextResponse.json(
      { error: 'Failed to process document', details: String(err) },
      { status: 500 }
    );
  }
}

// ── DELETE: Remove documento ──────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  await deleteDocument(id, user.id);
  return NextResponse.json({ success: true, deletedId: id });
}
