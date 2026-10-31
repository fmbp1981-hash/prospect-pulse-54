/**
 * POST /api/whatsapp/send
 * Envia mensagem WhatsApp (texto ou mídia) pela conexão de WhatsApp ativa da
 * organização do usuário (Sprint 2b): não lê user_settings nem variáveis de
 * ambiente. Organização = resolveOrganizationIdForUser(user.id); sem conexão
 * ativa → 409 WHATSAPP_NOT_CONFIGURED (nunca fallback para outra conexão/env).
 * Erros de envio voltam ao cliente só com mensagem genérica; o log leva apenas
 * organization_id e um código (sem telefone nem texto da mensagem).
 *
 * Body: { whatsapp, message?, mediaUrl?, mediaBase64?, mediaType?, mediaMimetype?, mediaFileName? }
 * Response: { success: true } | { success: false; error: string } | { error: { code, message } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { requireWriter, forbiddenWriterResponse } from '@/lib/auth/require-writer';
import { resolveOrganizationIdForUser } from '@/lib/connectors/org-context';
import { ConnectionNotConfiguredError } from '@/lib/connectors/types';
import {
  getWhatsAppForOrganization,
  WHATSAPP_NOT_CONFIGURED_ERROR,
  type OrgWhatsApp,
} from '@/lib/integrations/whatsapp/org-whatsapp';

const bodySchema = z
  .object({
    whatsapp: z.string().refine((v) => v.replace(/\D/g, '').length > 0, 'whatsapp é obrigatório'),
    message: z.string().max(4096).optional(),
    mediaUrl: z.string().url().optional(),
    mediaBase64: z.string().min(1).optional(),
    mediaType: z.enum(['image', 'document', 'video']).optional(),
    mediaMimetype: z.string().max(255).optional(),
    mediaFileName: z.string().max(255).optional(),
  })
  .refine((b) => !!b.message?.trim() || !!b.mediaUrl || !!b.mediaBase64, 'message ou mídia são obrigatórios');

function badRequest(error: string) {
  return NextResponse.json({ success: false, error }, { status: 400 });
}

function notConfigured() {
  return NextResponse.json({ error: WHATSAPP_NOT_CONFIGURED_ERROR }, { status: 409 });
}

export async function POST(req: NextRequest) {
  // 1. Autenticação
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await requireWriter(user.id))) return forbiddenWriterResponse();

  // 2. Body
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? 'Corpo inválido');
  }
  const { whatsapp, message, mediaUrl, mediaBase64, mediaType, mediaMimetype, mediaFileName } = parsed.data;
  const phone = whatsapp.replace(/\D/g, '');
  const hasMedia = !!(mediaUrl || mediaBase64);

  // 3. Conexão de WhatsApp da organização do usuário
  const organizationId = await resolveOrganizationIdForUser(user.id);
  if (!organizationId) return notConfigured();

  let conn: OrgWhatsApp;
  try {
    conn = await getWhatsAppForOrganization(organizationId);
  } catch (err) {
    if (err instanceof ConnectionNotConfiguredError) {
      console.warn('[/api/whatsapp/send] WhatsApp não configurado', {
        organization_id: organizationId,
        code: 'whatsapp_not_configured',
      });
      return notConfigured();
    }
    console.error('[/api/whatsapp/send] falha ao resolver conexão', {
      organization_id: organizationId,
      code: 'whatsapp_connection_error',
    });
    return NextResponse.json(
      { success: false, error: 'WhatsApp indisponível no momento. Tente novamente mais tarde.' },
      { status: 503 }
    );
  }

  // Meta Cloud API só envia mídia por URL pública.
  if (hasMedia && !mediaUrl && conn.provider.name === 'meta-cloud') {
    return badRequest('Meta Cloud API requer URL pública para envio de mídia.');
  }

  // 4. Envio
  const result = hasMedia
    ? await conn.provider.sendMedia(conn.target, phone, {
        type: mediaType ?? 'image',
        base64: mediaBase64,
        url: mediaUrl,
        mimetype: mediaMimetype ?? 'image/jpeg',
        fileName: mediaFileName,
        caption: message ?? '',
      })
    : await conn.provider.sendText(conn.target, phone, message ?? '');

  if (!result.success) {
    console.error('[/api/whatsapp/send] envio falhou', {
      organization_id: organizationId,
      code: 'whatsapp_send_failed',
    });
    return NextResponse.json(
      { success: false, error: 'Falha ao enviar a mensagem. Tente novamente mais tarde.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
