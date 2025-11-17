import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WhatsAppMessage {
  event: string;
  instance: string;
  data: {
    key: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
    };
    message: {
      conversation?: string;
      extendedTextMessage?: {
        text: string;
      };
    };
    pushName: string;
    messageTimestamp: number;
  };
}

/**
 * Gera resposta usando IA (Gemini via Lovable AI Gateway)
 */
async function generateAIResponse(
  leadName: string,
  leadCompany: string,
  userMessage: string,
  conversationHistory: Array<{ role: string; content: string }>,
  lovableApiKey: string
): Promise<string> {
  const systemPrompt = `Você é um assistente de vendas da empresa LeadFinder Pro.
Seu objetivo é qualificar leads que responderam à nossa mensagem de WhatsApp.

Informações do lead:
- Nome: ${leadName}
- Empresa: ${leadCompany}

Regras:
1. Seja cordial, profissional e direto
2. Faça perguntas para qualificar o lead (orçamento, necessidades, prazo)
3. Mantenha respostas curtas (máximo 3 frases)
4. Se o lead demonstrar interesse, agende uma call
5. Se o lead não tiver interesse, agradeça e encerre educadamente

Histórico da conversa:
${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}

Mensagem atual do lead: ${userMessage}

Responda de forma natural e profissional:`;

  try {
    const response = await fetch('https://lovable.app/api/ai-gateway', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: 'gemini-2.0-flash-exp',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      console.error('Lovable AI error:', await response.text());
      return `Olá! Obrigado pela sua mensagem. Nossa equipe entrará em contato em breve. 📞`;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'Desculpe, não consegui processar sua mensagem.';
  } catch (error) {
    console.error('AI generation error:', error);
    return `Olá! Obrigado pela sua mensagem. Nossa equipe entrará em contato em breve. 📞`;
  }
}

/**
 * Envia mensagem via Evolution API
 */
async function sendMessage(
  number: string,
  message: string,
  evolutionApiUrl: string,
  evolutionApiKey: string,
  instanceName: string
): Promise<void> {
  const url = `${evolutionApiUrl}/message/sendText/${instanceName}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': evolutionApiKey,
    },
    body: JSON.stringify({
      number: number,
      text: message,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send message: ${response.status}`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL')!;
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')!;
    const evolutionInstance = Deno.env.get('EVOLUTION_INSTANCE_NAME')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const webhookData: WhatsAppMessage = await req.json();

    console.log('📱 Webhook recebido:', JSON.stringify(webhookData, null, 2));

    // Ignorar mensagens enviadas por nós
    if (webhookData.data.key.fromMe) {
      console.log('⏭️ Mensagem enviada por nós, ignorando');
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extrair número e mensagem
    const number = webhookData.data.key.remoteJid.split('@')[0];
    const messageText =
      webhookData.data.message.conversation ||
      webhookData.data.message.extendedTextMessage?.text ||
      '';

    if (!messageText) {
      console.log('⏭️ Mensagem sem texto, ignorando');
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`💬 Mensagem de ${number}: ${messageText}`);

    // Buscar lead pelo telefone
    const { data: lead, error: leadError } = await supabase
      .from('leads_prospeccao')
      .select('*')
      .or(`telefone_whatsapp.eq.${number},telefone_whatsapp.eq.+${number}`)
      .single();

    if (leadError || !lead) {
      console.log(`⚠️ Lead não encontrado para número ${number}`);
      return new Response(JSON.stringify({ ok: true, message: 'Lead not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`✅ Lead encontrado: ${lead.empresa}`);

    // Buscar histórico de conversas
    const { data: history } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: true })
      .limit(10);

    const conversationHistory = (history || []).map(h => ({
      role: h.from_lead ? 'user' : 'assistant',
      content: h.message,
    }));

    // Salvar mensagem recebida
    await supabase.from('whatsapp_conversations').insert({
      lead_id: lead.id,
      message: messageText,
      from_lead: true,
      message_id: webhookData.data.key.id,
      timestamp: new Date(webhookData.data.messageTimestamp * 1000).toISOString(),
    });

    // Gerar resposta com IA (se configurado)
    let aiResponse = `Olá! Obrigado pelo contato. Nossa equipe entrará em contato em breve. 📞`;

    if (lovableApiKey) {
      console.log('🤖 Gerando resposta com IA...');
      aiResponse = await generateAIResponse(
        webhookData.data.pushName || 'Cliente',
        lead.empresa,
        messageText,
        conversationHistory,
        lovableApiKey
      );
      console.log(`🤖 Resposta gerada: ${aiResponse}`);
    }

    // Enviar resposta
    console.log('📤 Enviando resposta...');
    await sendMessage(number, aiResponse, evolutionApiUrl, evolutionApiKey, evolutionInstance);

    // Salvar resposta enviada
    await supabase.from('whatsapp_conversations').insert({
      lead_id: lead.id,
      message: aiResponse,
      from_lead: false,
      timestamp: new Date().toISOString(),
    });

    // Atualizar status do lead
    await supabase
      .from('leads_prospeccao')
      .update({
        status: 'Em Atendimento',
        updated_at: new Date().toISOString(),
      })
      .eq('id', lead.id);

    console.log('✅ Resposta enviada com sucesso!');

    return new Response(
      JSON.stringify({
        ok: true,
        lead: lead.empresa,
        response: aiResponse,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ Erro no webhook:', error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
