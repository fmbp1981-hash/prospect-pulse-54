/**
 * GET /api/admin/register-templates?secret=CRON_SECRET
 *
 * Registra os 9 templates de WhatsApp da campanha IntelliX diretamente
 * na Meta Graph API. Idempotente — pula templates já existentes.
 *
 * Após o registro, Meta leva 48-72h para aprovar. Status retornado:
 *   "created"   → submetido agora
 *   "skipped"   → já existia na conta
 *   "error"     → falha (detalhes no campo error)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 120;

const META_VERSION = 'v20.0';

const TEMPLATES = [
  {
    name: 'intellix_er_universal_v1',
    body: 'Oi, {{1}}! Aqui é o Felipe, da IntelliX.AI. A gente se encontrou no Encontro & Relacionamento do Dirceu Cordeiro — foi muito bom conhecer o trabalho da {{2}}. Queria te mandar um resumo de 2 minutos sobre como ajudamos empresas do Nordeste a automatizar tarefas repetitivas com IA, sem complicar a operação. Posso te enviar? Se preferir não receber, responda "sair".',
  },
  {
    name: 'intellix_er_construcao_v1',
    body: 'Oi, {{1}}! Aqui é o Felipe, da IntelliX.AI. A gente se cruzou no Encontro & Relacionamento do Dirceu Cordeiro — foi bom conhecer a {{2}}. Trabalho com empresas de construção e imobiliário que perdem tempo qualificando leads sem perfil e fazendo follow-up manual em negociação longa. Posso te mostrar como resolver em 2 minutos? Se preferir não receber, responda "sair".',
  },
  {
    name: 'intellix_er_juridico_v1',
    body: 'Oi, {{1}}! Aqui é o Felipe, da IntelliX.AI. A gente se encontrou no Encontro do Dirceu Cordeiro — curti conhecer a {{2}}. Muitos escritórios perdem tempo com triagem de casos fora do perfil e atendimento inicial que não converte. Tenho uma solução específica para isso. Posso te mandar um resumo? Se preferir não receber, responda "sair".',
  },
  {
    name: 'intellix_er_saude_v1',
    body: 'Oi, {{1}}! Aqui é o Felipe, da IntelliX.AI. A gente se encontrou no Encontro do Dirceu Cordeiro — foi ótimo conhecer a {{2}}. Clínicas e laboratórios costumam ter duas dores: confirmar consultas manualmente e perder pacientes que não retornam. A gente resolve as duas com IA, sem trocar de sistema. Posso te mandar um resumo? Se preferir não receber, responda "sair".',
  },
  {
    name: 'intellix_er_atacado_v1',
    body: 'Oi, {{1}}! Aqui é o Felipe, da IntelliX.AI. A gente se cruzou no Encontro do Dirceu Cordeiro — curti conhecer a {{2}}. Distribuidoras e atacadistas perdem tempo respondendo pedidos no WhatsApp e cobrando manualmente. A gente automatiza isso e libera o time. Posso te mostrar como funciona? Se preferir não receber, responda "sair".',
  },
  {
    name: 'intellix_er_tech_v1',
    body: 'Oi, {{1}}! Aqui é o Felipe, da IntelliX.AI. A gente se encontrou no Encontro do Dirceu Cordeiro — foi bom trocar ideia com a {{2}}. Empresas de TI têm dois desafios: prospecção ativa escassa e suporte que consome o time técnico. Tenho soluções para os dois — e uma conversa sobre parceria que pode fazer sentido. Posso mandar mais detalhes? Se preferir não receber, responda "sair".',
  },
  {
    name: 'intellix_er_agencia_v1',
    body: 'Oi, {{1}}! Aqui é o Felipe, da IntelliX.AI. A gente se encontrou no Encontro do Dirceu Cordeiro — curti conhecer a {{2}}. Agências perdem tempo gerando relatório manual e fazendo onboarding de novos contratos. A gente automatiza isso com IA e o time foca em estratégia. Posso te mandar um resumo? Se preferir não receber, responda "sair".',
  },
  {
    name: 'intellix_er_financeiro_v1',
    body: 'Oi, {{1}}! Aqui é o Felipe, da IntelliX.AI. A gente se cruzou no Encontro do Dirceu Cordeiro — foi bom conhecer a {{2}}. Empresas de consultoria e seguros recebem muitos leads mas qualificam poucos, e perdem venda por falta de follow-up. A gente resolve isso com automação inteligente. Posso te mostrar como? Se preferir não receber, responda "sair".',
  },
  {
    name: 'intellix_er_energiasolar_v1',
    body: 'Oi, {{1}}! Aqui é o Felipe, da IntelliX.AI. A gente se encontrou no Encontro do Dirceu Cordeiro — curti conhecer a {{2}}. Empresas de energia solar recebem muitos leads mas convertem pouco, por falta de qualificação rápida e follow-up pós-visita. A gente automatiza esse funil. Posso te mandar um resumo? Se preferir não receber, responda "sair".',
  },
];

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function getWabaId(phoneNumberId: string, token: string): Promise<string> {
  const url = `https://graph.facebook.com/${META_VERSION}/${phoneNumberId}?fields=whatsapp_business_account&access_token=${token}`;
  const res = await fetch(url);
  const data = await res.json() as { whatsapp_business_account?: { id: string }; error?: { message: string } };
  if (data.error) throw new Error(`Meta API: ${data.error.message}`);
  if (!data.whatsapp_business_account?.id) throw new Error('WABA ID not found for phone number');
  return data.whatsapp_business_account.id;
}

async function getExistingTemplates(wabaId: string, token: string): Promise<Set<string>> {
  const url = `https://graph.facebook.com/${META_VERSION}/${wabaId}/message_templates?fields=name&limit=100&access_token=${token}`;
  const res = await fetch(url);
  const data = await res.json() as { data?: Array<{ name: string }>; error?: { message: string } };
  if (data.error) throw new Error(`Meta API: ${data.error.message}`);
  return new Set((data.data ?? []).map((t) => t.name));
}

async function createTemplate(wabaId: string, token: string, name: string, body: string) {
  const url = `https://graph.facebook.com/${META_VERSION}/${wabaId}/message_templates`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      category: 'MARKETING',
      language: 'pt_BR',
      components: [
        {
          type: 'BODY',
          text: body,
          example: { body_text: [['Felipe', 'Empresa Exemplo']] },
        },
      ],
    }),
  });
  const data = await res.json() as { id?: string; status?: string; error?: { message: string; error_subcode?: number } };
  if (data.error) throw new Error(data.error.message);
  return data;
}

export async function GET(req: NextRequest) {
  const CRON_SECRET = process.env.CRON_SECRET;
  if (!CRON_SECRET) return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 });

  const secret = req.nextUrl.searchParams.get('secret');
  const authHeader = req.headers.get('authorization');
  if (secret !== CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceClient();

  // Busca credenciais Meta do tenant IntelliX
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const authUser = users.find((u) => u.email === 'contato@intellixai.com.br');
  if (!authUser) return NextResponse.json({ error: 'IntelliX user not found' }, { status: 404 });

  const { data: settings } = await supabase
    .from('user_settings')
    .select('business_phone_number_id, business_access_token')
    .eq('user_id', authUser.id)
    .single();

  const phoneNumberId = settings?.business_phone_number_id as string | null;
  const token = settings?.business_access_token as string | null;

  if (!phoneNumberId || !token) {
    return NextResponse.json({ error: 'Meta credentials not configured (T2 missing)' }, { status: 422 });
  }

  try {
    // 1. Obtém WABA ID a partir do phone number
    const wabaId = await getWabaId(phoneNumberId, token);

    // 2. Lista templates já existentes (idempotência)
    const existing = await getExistingTemplates(wabaId, token);

    // 3. Cria cada template
    const results = [];
    for (const tpl of TEMPLATES) {
      if (existing.has(tpl.name)) {
        results.push({ name: tpl.name, status: 'skipped — already exists' });
        continue;
      }
      try {
        const created = await createTemplate(wabaId, token, tpl.name, tpl.body);
        results.push({ name: tpl.name, status: 'submitted', metaStatus: created.status });
      } catch (err) {
        results.push({ name: tpl.name, status: 'error', error: String(err) });
      }
    }

    const errors = results.filter((r) => r.status === 'error');
    return NextResponse.json(
      { wabaId, totalTemplates: TEMPLATES.length, results },
      { status: errors.length > 0 ? 207 : 200 }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
