import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateTemplateRequest {
  description: string;
  category: string;
  tone: 'profissional' | 'casual' | 'misto';
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Groq API key (gratuita)
    const groqApiKey = Deno.env.get('GROQ_API_KEY');

    // Fallback para Gemini se Groq não estiver configurada
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verificar autenticação
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Sem autorização');
    }

    const { description, category, tone }: GenerateTemplateRequest = await req.json();

    if (!description || !category) {
      throw new Error('Descrição e categoria são obrigatórias');
    }

    let generatedText = '';

    // Prompt otimizado
    const systemPrompt = `Você é um assistente especializado em criar mensagens de WhatsApp para prospecção B2B.

Tarefa: Criar 3 variações de mensagem para: "${description}"

Categoria: ${category}
Tom: ${tone}

Variáveis que DEVEM ser usadas:
- {{minha_empresa}} - Nome da empresa que está ENVIANDO a mensagem
- {{empresa}} - Nome da empresa PROSPECTADA
- {{categoria}} - Categoria do negócio prospectado
- {{cidade}} - Cidade do lead prospectado
- {{contato}} - Nome do contato (use {{empresa}} se não houver nome)

Regras:
1. Crie EXATAMENTE 3 variações
2. Variação 1: Tom FORMAL (👔)
3. Variação 2: Tom CASUAL (😊)
4. Variação 3: Tom DIRETO (🎯)
5. 30-80 palavras cada
6. Use emojis com moderação
7. Foque em gerar interesse
8. SEMPRE use {{minha_empresa}} para se apresentar
9. Use as outras variáveis para personalizar para o lead

Formato (SIGA EXATAMENTE):
VARIACAO_1:
[mensagem formal aqui]

VARIACAO_2:
[mensagem casual aqui]

VARIACAO_3:
[mensagem direta aqui]

NOME_TEMPLATE:
[nome curto, máx 50 caracteres]`;

    // Tentar Groq primeiro (gratuito e rápido)
    if (groqApiKey) {
      console.log('🤖 Usando Groq API (Llama 3)');

      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile', // Modelo gratuito e rápido (atualizado)
          messages: [
            { role: 'system', content: 'Você é um assistente de marketing especializado em mensagens WhatsApp B2B.' },
            { role: 'user', content: systemPrompt }
          ],
          temperature: 0.8,
          max_tokens: 1000,
        }),
      });

      if (!groqResponse.ok) {
        console.error('Groq API error:', await groqResponse.text());
        throw new Error('Erro na Groq API');
      }

      const groqData = await groqResponse.json();
      generatedText = groqData.choices?.[0]?.message?.content || '';
    }
    // Fallback para Gemini Flash (também gratuito)
    else if (geminiApiKey) {
      console.log('🤖 Usando Google Gemini Flash');

      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: systemPrompt }]
            }],
            generationConfig: {
              temperature: 0.8,
              maxOutputTokens: 1000,
            },
          }),
        }
      );

      if (!geminiResponse.ok) {
        console.error('Gemini API error:', await geminiResponse.text());
        throw new Error('Erro na Gemini API');
      }

      const geminiData = await geminiResponse.json();
      generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
    else {
      throw new Error('Nenhuma API de IA configurada. Configure GROQ_API_KEY ou GEMINI_API_KEY');
    }

    console.log('✅ Template gerado com sucesso');

    return new Response(
      JSON.stringify({
        success: true,
        generated_text: generatedText,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ Erro:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
