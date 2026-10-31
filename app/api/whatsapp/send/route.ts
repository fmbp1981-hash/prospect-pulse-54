/**
 * POST /api/whatsapp/send
 * Envia mensagem WhatsApp nativamente via Evolution API ou Meta Cloud API,
 * usando as credenciais salvas nas configurações do usuário.
 *
 * Segurança (T9-C1): a instância vem só de resolveInstanceForUser (coluna
 * protegida); URL e chave Evolution são do tenant OU globais, nunca misturadas;
 * Meta exige Phone Number ID e token do próprio tenant (sem META_WA_*).
 *
 * Body: { whatsapp: string; message: string }
 * Response: { success: true } | { success: false; error: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { resolveInstanceForUser } from '@/lib/services/tenant-resolver.service';
import { resolveEvolutionEndpoint } from '@/lib/integrations/whatsapp/evolution-credentials';
import { requireWriter, forbiddenWriterResponse } from '@/lib/auth/require-writer';

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
  const body = await req.json() as {
    whatsapp?: string;
    message?: string;
    mediaUrl?: string;
    mediaBase64?: string;
    mediaType?: 'image' | 'document' | 'video';
    mediaMimetype?: string;
    mediaFileName?: string;
  };
  const { whatsapp, message, mediaUrl, mediaBase64, mediaType, mediaMimetype, mediaFileName } = body;

  if (!whatsapp?.trim()) {
    return NextResponse.json(
      { success: false, error: 'whatsapp é obrigatório' },
      { status: 400 }
    );
  }
  if (!message?.trim() && !mediaUrl && !mediaBase64) {
    return NextResponse.json(
      { success: false, error: 'message ou mídia são obrigatórios' },
      { status: 400 }
    );
  }

  const hasMedia = !!(mediaUrl || mediaBase64);

  // Normaliza: apenas dígitos
  const phone = whatsapp.replace(/\D/g, '');

  // 3. Busca configurações do usuário
  const { data: settings } = await supabase
    .from('user_settings')
    .select('provider, evolution_api_url, evolution_api_key, business_phone_number_id, business_access_token')
    .eq('user_id', user.id)
    .single();

  const provider = settings?.provider || process.env.WHATSAPP_PROVIDER || 'evolution';

  try {
    if (provider === 'meta') {
      // ── Meta Cloud API ────────────────────────────────────────────────────
      // Credenciais do próprio tenant; sem fallback para META_WA_* (número da plataforma).
      const phoneNumberId = (settings?.business_phone_number_id ?? '').trim();
      const token = (settings?.business_access_token ?? '').trim();
      const version = process.env.META_WA_VERSION || 'v20.0';

      if (!phoneNumberId || !token) {
        return NextResponse.json({
          success: false,
          error: 'Meta Cloud API não configurada. Acesse Configurações → Integração WhatsApp e preencha o Phone Number ID e o Token de Acesso.',
        }, { status: 400 });
      }

      if (hasMedia) {
        if (!mediaUrl) {
          return NextResponse.json({ success: false, error: 'Meta Cloud API requer URL pública para envio de mídia.' }, { status: 400 });
        }
        const type = mediaType || 'image';
        const res = await fetch(
          `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: phone,
              type,
              [type]: { link: mediaUrl, ...(message ? { caption: message } : {}) },
            }),
          }
        );
        if (!res.ok) { const err = await res.text(); throw new Error(`Meta API ${res.status}: ${err}`); }
      } else {
        const res = await fetch(
          `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: phone,
              type: 'text',
              text: { preview_url: false, body: message },
            }),
          }
        );
        if (!res.ok) { const err = await res.text(); throw new Error(`Meta API ${res.status}: ${err}`); }
      }
    } else {
      // ── Evolution API (padrão) ─────────────────────────────────────────────
      // Instância protegida do próprio usuário (nunca EVOLUTION_INSTANCE_NAME).
      const instanceName = await resolveInstanceForUser(user.id);
      if (!instanceName) {
        return NextResponse.json({
          success: false,
          error: 'Instância WhatsApp não definida para sua conta. Fale com o administrador da plataforma.',
        }, { status: 400 });
      }

      // URL + chave do tenant juntas, ou URL + chave globais juntas — nunca misturadas.
      const endpoint = resolveEvolutionEndpoint(settings?.evolution_api_url, settings?.evolution_api_key);
      if (!endpoint) {
        return NextResponse.json({
          success: false,
          error: 'Evolution API não configurada. Em Configurações → Integração WhatsApp preencha a URL e a API Key juntas (ou deixe as duas em branco para usar o servidor padrão).',
        }, { status: 400 });
      }
      const { apiUrl, apiKey } = endpoint;

      if (hasMedia) {
        const type = mediaType || 'image';
        const mime = mediaMimetype || 'image/jpeg';
        const ext = mime.split('/')[1] || 'jpg';
        const res = await fetch(`${apiUrl}/message/sendMedia/${instanceName}`, {
          method: 'POST',
          headers: { apikey: apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            number: phone,
            mediatype: type,
            mimetype: mime,
            caption: message || '',
            media: mediaBase64 || mediaUrl,
            fileName: mediaFileName || `imagem.${ext}`,
          }),
        });
        if (!res.ok) { const err = await res.text(); throw new Error(`Evolution API ${res.status}: ${err}`); }
      } else {
        const res = await fetch(`${apiUrl}/message/sendText/${instanceName}`, {
          method: 'POST',
          headers: { apikey: apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: phone, text: message }),
        });
        if (!res.ok) { const err = await res.text(); throw new Error(`Evolution API ${res.status}: ${err}`); }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[/api/whatsapp/send]', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
