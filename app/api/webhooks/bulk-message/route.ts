/**
 * FLUXO 5 - DISPARO EM MASSA
 * Equivalente nativo ao "Webhook2" do n8n.
 * Endpoint: POST /api/webhooks/bulk-message
 *
 * Corresponde ao endpoint n8n: POST /msg_evolution
 */

import { NextRequest, NextResponse } from 'next/server';
import { bulkSender } from '@/lib/jobs/bulk-sender.job';

export const runtime = 'nodejs';

interface BulkMessagePayload {
  messages: Array<{
    whatsapp: string;
    message: string;
  }>;
  instanceName: string;
  delayMs?: number;
}

export async function POST(req: NextRequest) {
  let body: BulkMessagePayload;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.messages || !Array.isArray(body.messages) || !body.instanceName) {
    return NextResponse.json(
      { error: 'messages (array) and instanceName are required' },
      { status: 400 }
    );
  }

  const jobId = await bulkSender.enqueue({
    messages: body.messages,
    instanceName: body.instanceName,
    delayMs: body.delayMs ?? 10000, // 10s default entre mensagens (igual ao n8n)
  });

  return NextResponse.json({ queued: true, jobId, count: body.messages.length });
}
