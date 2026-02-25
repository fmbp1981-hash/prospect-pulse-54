/**
 * POST /api/whatsapp/send
 * Envia mensagem WhatsApp nativamente via Evolution API ou Meta Cloud API,
 * usando as credenciais salvas nas configurações do usuário.
 *
 * Body: { whatsapp: string; message: string }
 * Response: { success: true } | { success: false; error: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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

  // 2. Body
  const body = await req.json() as { whatsapp?: string; message?: string };
  const { whatsapp, message } = body;

  if (!whatsapp?.trim() || !message?.trim()) {
    return NextResponse.json(
      { success: false, error: 'whatsapp e message são obrigatórios' },
      { status: 400 }
    );
  }

  // Normaliza: apenas dígitos
  const phone = whatsapp.replace(/\D/g, '');

  // 3. Busca configurações do usuário
  const { data: settings } = await supabase
    .from('user_settings')
    .select('provider, evolution_api_url, evolution_api_key, evolution_instance_name, business_phone_number_id, business_access_token')
    .eq('user_id', user.id)
    .single();

  const provider = settings?.provider || process.env.WHATSAPP_PROVIDER || 'evolution';

  try {
    if (provider === 'meta') {
      // ── Meta Cloud API ────────────────────────────────────────────────────
      const phoneNumberId = settings?.business_phone_number_id || process.env.META_WA_PHONE_NUMBER_ID;
      const token = settings?.business_access_token || process.env.META_WA_TOKEN;
      const version = process.env.META_WA_VERSION || 'v20.0';

      if (!phoneNumberId || !token) {
        return NextResponse.json({
          success: false,
          error: 'Meta Cloud API não configurada. Acesse Configurações → Integração WhatsApp e preencha o Phone Number ID e o Token de Acesso.',
        }, { status: 400 });
      }

      const res = await fetch(
        `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phone,
            type: 'text',
            text: { preview_url: false, body: message },
          }),
        }
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Meta API ${res.status}: ${err}`);
      }
    } else {
      // ── Evolution API (padrão) ─────────────────────────────────────────────
      const apiUrl = (settings?.evolution_api_url || process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
      const apiKey = settings?.evolution_api_key || process.env.EVOLUTION_API_KEY;
      const instanceName = settings?.evolution_instance_name || process.env.EVOLUTION_INSTANCE_NAME;

      if (!apiUrl || !apiKey || !instanceName) {
        return NextResponse.json({
          success: false,
          error: 'Evolution API não configurada. Acesse Configurações → Integração WhatsApp e preencha a URL, API Key e Nome da Instância.',
        }, { status: 400 });
      }

      const res = await fetch(`${apiUrl}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: {
          apikey: apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ number: phone, text: message }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Evolution API ${res.status}: ${err}`);
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
