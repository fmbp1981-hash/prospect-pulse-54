import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProspectionRequest {
  niche: string;
  location: string | {
    country: string;
    state: string;
    city: string;
    neighborhood?: string;
  };
  quantity: number;
}

interface GooglePlacesResult {
  place_id: string;
  name: string;
  formatted_address?: string;
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  rating?: number;
  user_ratings_total?: number;
  business_status?: string;
  types?: string[];
  geometry?: {
    location: {
      lat: number;
      lng: number;
    };
  };
  enrichedSummary?: string;
}

// Função para gerar mensagem WhatsApp personalizada via Lovable AI
async function generateWhatsAppMessage(
  nomeEmpresa: string,
  categoria: string,
  cidade: string,
  lovableApiKey: string
): Promise<string> {
  // Selecionar aleatoriamente um dos 3 modelos
  const modelos = [
    `Olá, ${nomeEmpresa}! 👋
Aqui é da XPAG, empresa especializada em soluções de pagamento para negócios como o seu.
Vi que vocês atuam como ${categoria} em ${cidade} e achei que poderia ser interessante apresentar a XPAG.
Caso faça sentido, posso te conectar com um consultor XPAG para explicar como podemos apoiar o crescimento do seu negócio. 😊`,
    
    `Oi, ${nomeEmpresa}! Tudo bem? 🙂
Sou da XPAG, e percebi que vocês são ${categoria} aí em ${cidade}.
Temos ajudado empresas desse segmento a tornar o processo de pagamento mais simples e prático.
Se quiser conhecer um pouco mais, posso te colocar em contato com um consultor XPAG.`,
    
    `Olá, ${nomeEmpresa}! 👋
Sou da XPAG, e vi que vocês atuam como ${categoria} em ${cidade}.
Trabalhamos com empresas desse perfil oferecendo soluções que tornam o recebimento mais fácil e rápido.
Posso pedir para um consultor XPAG te enviar mais informações?`
  ];

  const modeloSelecionado = modelos[Math.floor(Math.random() * modelos.length)];

  try {
    // Gerar variação natural da mensagem via Lovable AI
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'Você é um assistente de prospecção comercial. Reescreva a mensagem mantendo o tom cordial, profissional e neutro. Mantenha os emojis. Mantenha o nome da empresa XPAG. A mensagem deve ter no máximo 300 caracteres e ser natural, como se fosse escrita por uma pessoa.'
          },
          {
            role: 'user',
            content: `Reescreva esta mensagem de forma natural:\n\n${modeloSelecionado}`
          }
        ],
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      console.warn('⚠️ Lovable AI falhou, usando mensagem padrão');
      return modeloSelecionado;
    }

    const data = await response.json();
    const mensagemGerada = data.choices?.[0]?.message?.content?.trim();
    
    return mensagemGerada || modeloSelecionado;
  } catch (error) {
    console.error('❌ Erro ao gerar mensagem via Lovable AI:', error);
    return modeloSelecionado;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { niche, location, quantity } = await req.json() as ProspectionRequest;
    
    console.log('📍 Prospecção iniciada:', { niche, location, quantity });

    // Validações
    if (!niche || !location || !quantity) {
      return new Response(
        JSON.stringify({ error: 'Parâmetros inválidos: niche, location e quantity são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!GOOGLE_API_KEY) {
      console.error('❌ GOOGLE_PLACES_API_KEY não configurada');
      return new Response(
        JSON.stringify({ error: 'API Key do Google Places não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Formatar localização para busca
    const locationQuery = typeof location === 'string' 
      ? location 
      : `${location.city}, ${location.state}, ${location.country}`;

    // 1. Buscar lugares no Google Places
    console.log('🔍 Buscando no Google Places:', { niche, location: locationQuery });
    
    const searchQuery = `${niche} em ${locationQuery}`;
    const textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${GOOGLE_API_KEY}`;
    
    const searchResponse = await fetch(textSearchUrl);
    const searchData = await searchResponse.json();

    if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
      console.error('❌ Erro na API do Google Places:', searchData);
      return new Response(
        JSON.stringify({ error: `Erro na API do Google: ${searchData.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = searchData.results || [];
    console.log(`✅ Encontrados ${results.length} resultados no Google Places`);

    // Limitar pela quantidade solicitada
    const limitedResults = results.slice(0, Math.min(quantity, results.length));

    // 2. Buscar detalhes de cada lugar, enriquecer com Firecrawl e gerar mensagens WhatsApp
    const detailedPlaces: GooglePlacesResult[] = [];
    
    for (const place of limitedResults) {
      try {
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,business_status,types,geometry&key=${GOOGLE_API_KEY}`;
        
        const detailsResponse = await fetch(detailsUrl);
        const detailsData = await detailsResponse.json();
        
        if (detailsData.status === 'OK' && detailsData.result) {
          const placeData = detailsData.result;
          
          // Enriquecer com Firecrawl se houver website e API key configurada
          if (placeData.website && FIRECRAWL_API_KEY) {
            try {
              console.log(`🔥 Enriquecendo dados de ${placeData.name} com Firecrawl`);
              
              const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  url: placeData.website,
                  formats: ['markdown'],
                  onlyMainContent: true,
                  timeout: 10000,
                }),
              });

              if (firecrawlResponse.ok) {
                const firecrawlData = await firecrawlResponse.json();
                const content = firecrawlData.data?.markdown || '';
                
                // Extrair resumo (primeiros 500 caracteres do conteúdo)
                const summary = content.substring(0, 500).trim();
                if (summary) {
                  placeData.enrichedSummary = summary;
                  console.log(`✅ Dados enriquecidos para ${placeData.name}`);
                }
              } else {
                console.log(`⚠️ Firecrawl falhou para ${placeData.website}: ${firecrawlResponse.status}`);
              }
            } catch (firecrawlError) {
              console.error(`❌ Erro ao enriquecer com Firecrawl:`, firecrawlError);
            }
          }
          
          detailedPlaces.push(placeData);
        }
        
        // Delay para evitar rate limiting
        await new Promise(resolve => setTimeout(resolve, 150));
      } catch (error) {
        console.error('❌ Erro ao buscar detalhes do lugar:', error);
      }
    }

    console.log(`✅ Coletados detalhes de ${detailedPlaces.length} lugares`);

    // 3. Gerar mensagens WhatsApp personalizadas
    console.log('💬 Gerando mensagens WhatsApp personalizadas via Lovable AI...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const leadsToInsert = await Promise.all(
      detailedPlaces.map(async (place) => {
        // Extrair telefone (preferir internacional)
        const phone = place.international_phone_number || place.formatted_phone_number || '';
        
        // Extrair endereço completo
        const address = place.formatted_address || '';
        
        // Tentar extrair cidade do endereço
        const addressParts = address.split(',');
        const city = addressParts.length > 1 ? addressParts[addressParts.length - 2].trim() : locationQuery;
        
        // Gerar mensagem WhatsApp personalizada
        let mensagemWhatsApp = null;
        if (LOVABLE_API_KEY) {
          try {
            mensagemWhatsApp = await generateWhatsAppMessage(
              place.name || 'Empresa',
              niche || 'estabelecimento',
              city,
              LOVABLE_API_KEY
            );
            console.log(`✅ Mensagem gerada para ${place.name}`);
          } catch (error) {
            console.error(`❌ Erro ao gerar mensagem para ${place.name}:`, error);
          }
        }
        
        return {
          id: place.place_id,
          nome_empresa: place.name,
          categoria: niche,
          telefone: phone,
          endereco: address,
          cidade: city,
          estado: addressParts.length > 0 ? addressParts[addressParts.length - 1].trim() : null,
          pais: 'Brasil',
          website: place.website || null,
          latitude: place.geometry?.location.lat || null,
          longitude: place.geometry?.location.lng || null,
          avaliacao: place.rating || null,
          total_avaliacoes: place.user_ratings_total || null,
          resumo_site: place.enrichedSummary || null,
          mensagem_whatsapp: mensagemWhatsApp,
          status: 'novo',
          origem: 'google_places',
        };
      })
    );

    // 4. Salvar no Supabase
    console.log('💾 Salvando leads no Supabase...');
    
    if (leadsToInsert.length > 0) {
      const { data: insertedLeads, error: insertError } = await supabase
        .from('leads_prospeccao')
        .upsert(leadsToInsert, { onConflict: 'id' })
        .select();

      if (insertError) {
        console.error('❌ Erro ao inserir leads no Supabase:', insertError);
        return new Response(
          JSON.stringify({ error: 'Erro ao salvar leads no banco de dados' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`✅ ${insertedLeads?.length || 0} leads salvos no Supabase com mensagens WhatsApp`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Prospecção concluída! ${detailedPlaces.length} leads encontrados e salvos.`,
        count: detailedPlaces.length,
        leads: leadsToInsert,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro na Edge Function de prospecção:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        success: false 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
