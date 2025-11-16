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
  user_id?: string; // ID do usuário autenticado (multi-tenant)
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

// Função para obter o próximo número de Lead
async function getNextLeadNumber(supabase: any): Promise<number> {
  console.log('🔢 Iniciando getNextLeadNumber...');
  
  try {
    const { data, error } = await supabase
      .from('leads_prospeccao')
      .select('lead')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('❌ Erro ao buscar último lead:', error);
      return 1;
    }

    if (!data || data.length === 0) {
      console.log('📊 Tabela vazia, iniciando com Lead-001');
      return 1;
    }

    const lastLead = data[0].lead;
    console.log('📋 Último lead encontrado:', lastLead);
    
    const match = lastLead.match(/Lead-(\d+)/);
    if (match) {
      const nextNumber = parseInt(match[1], 10) + 1;
      console.log('✅ Próximo número será:', nextNumber);
      return nextNumber;
    }

    console.log('⚠️ Formato de lead não reconhecido, usando 1');
    return 1;
  } catch (error) {
    console.error('❌ Erro crítico ao obter próximo número de lead:', error);
    return 1;
  }
}

// Formatar número como "Lead-XXX"
function formatLeadNumber(num: number): string {
  return `Lead-${String(num).padStart(3, '0')}`;
}

// Gerar ID único quando place_id não estiver disponível
function generateUniqueId(placeName: string, address: string): string {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const cleanName = placeName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
  return `${cleanName}-${timestamp}-${randomStr}`;
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
    // Pegar token de autenticação do header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Autenticação necessária' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { niche, location, quantity, user_id } = await req.json() as ProspectionRequest;

    console.log('📍 Prospecção iniciada:', { niche, location, quantity, user_id });

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
    const searchQuery = `${niche} em ${locationQuery}`;
    console.log('🔍 Buscando no Google Places:', { niche, location: locationQuery });
    console.log('📍 Query de busca completa:', searchQuery);
    
    const textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${GOOGLE_API_KEY}`;
    
    const searchResponse = await fetch(textSearchUrl);
    const searchData = await searchResponse.json();

    if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
      console.error('❌ Erro na API do Google Places:', searchData);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: `Erro na API do Google: ${searchData.status}`,
          details: searchData.error_message
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = searchData.results || [];
    console.log(`✅ Encontrados ${results.length} resultados no Google Places`);
    
    if (results.length === 0) {
      console.log('⚠️ Nenhum resultado encontrado para a busca');
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Nenhum estabelecimento encontrado para os critérios de busca',
          insertedCount: 0,
          recurrentCount: 0,
          total: 0,
          count: 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Limitar pela quantidade solicitada
    const limitedResults = results.slice(0, Math.min(quantity, results.length));

    // 2. Buscar detalhes de cada lugar, enriquecer com Firecrawl e gerar mensagens WhatsApp
    console.log('\n🔄 Iniciando processamento detalhado dos leads...');
    const detailedPlaces: GooglePlacesResult[] = [];
    const failedPlaces = [];
    
    for (const place of limitedResults) {
      try {
        if (!place.place_id) {
          console.error('❌ place_id não encontrado para:', place.name);
          failedPlaces.push({ name: place.name, error: 'place_id missing' });
          continue;
        }

        console.log(`\n🏢 Processando: ${place.name} (ID: ${place.place_id})`);
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,business_status,types,geometry&key=${GOOGLE_API_KEY}`;
        
        const detailsResponse = await fetch(detailsUrl);
        const detailsData = await detailsResponse.json();

        if (detailsData.status === 'OK' && detailsData.result) {
          const placeData = detailsData.result;

          // Garantir que place_id existe, senão gerar um ID único
          if (!placeData.place_id) {
            console.warn(`⚠️ place_id ausente nos detalhes de ${placeData.name}, gerando ID único`);
            placeData.place_id = generateUniqueId(
              placeData.name || 'unknown',
              placeData.formatted_address || ''
            );
          }

          console.log('✅ Detalhes obtidos com sucesso');
          
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
              const errorMsg = firecrawlError instanceof Error ? firecrawlError.message : 'Unknown error';
              console.error(`❌ Erro ao enriquecer com Firecrawl:`, errorMsg);
            }
          }
          
          detailedPlaces.push(placeData);
          console.log(`✅ Lead processado: ${placeData.name}`);
        } else {
          console.error(`❌ Erro ao buscar detalhes:`, detailsData.status);
          failedPlaces.push({ name: place.name, error: detailsData.status });
        }
        
        // Delay para evitar rate limiting
        await new Promise(resolve => setTimeout(resolve, 150));
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Erro ao buscar detalhes do lugar:', errorMsg);
        failedPlaces.push({ name: place.name, error: errorMsg });
      }
    }

    console.log(`✅ Coletados detalhes de ${detailedPlaces.length} lugares`);
    console.log(`❌ Falhas no processamento: ${failedPlaces.length}`);

    // 3. Gerar mensagens WhatsApp personalizadas
    console.log('💬 Gerando mensagens WhatsApp personalizadas via Lovable AI...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    // Usar token do usuário autenticado para que auth.uid() funcione
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });

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
        
        // Gerar data formatada
        const dataFormatada = new Date().toLocaleDateString('pt-BR', { 
          day: '2-digit', 
          month: '2-digit', 
          year: 'numeric' 
        }) + ', ' + new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit'
        });

        return {
          id: place.place_id || generateUniqueId(place.name || 'unknown', address),
          lead: '', // Será gerado sequencialmente na inserção
          empresa: place.name,
          categoria: niche,
          telefone_whatsapp: phone,
          endereco: address,
          cidade: city,
          bairro_regiao: null,
          website: place.website || null,
          instagram: null,
          link_gmn: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
          aceita_cartao: null,
          mensagem_whatsapp: mensagemWhatsApp,
          status_msg_wa: 'not_sent',
          data_envio_wa: null,
          resumo_analitico: place.enrichedSummary || null,
          cnpj: null,
          status: 'Novo',
          data: dataFormatada,
          email: null,
          contato: null,
          user_id: user_id || null, // Multi-tenant: associar ao usuário
        };
      })
    );

    // 4. Salvar no Supabase com verificação de duplicatas
    console.log('\n💾 Salvando leads no Supabase...');
    console.log(`📊 Total de leads para inserir: ${leadsToInsert.length}`);
    
    let insertedCount = 0;
    let recurrentCount = 0;
    const insertErrors = [];
    
    if (leadsToInsert.length > 0) {
      // Obter próximo número de lead
      let nextLeadNumber = await getNextLeadNumber(supabase);
      console.log(`🔢 Iniciando numeração a partir de: Lead-${String(nextLeadNumber).padStart(3, '0')}`);
      
      for (const lead of leadsToInsert) {
        try {
          // Validar dados obrigatórios
          if (!lead.id || !lead.empresa) {
            console.error('❌ Dados obrigatórios faltando:', { id: lead.id, empresa: lead.empresa });
            insertErrors.push({ empresa: lead.empresa || 'Unknown', error: 'Missing required fields' });
            continue;
          }

          console.log(`\n🔍 Verificando duplicata para: ${lead.empresa}`);
          
          // Verificar se o lead já existe
          const { data: existingLead, error: checkError } = await supabase
            .from('leads_prospeccao')
            .select('id, status, lead')
            .eq('id', lead.id)
            .maybeSingle();

          if (checkError) {
            console.error('❌ Erro ao verificar lead existente:', checkError);
            insertErrors.push({ empresa: lead.empresa, error: checkError.message });
            continue;
          }

          if (existingLead) {
            // Lead já existe - marcar como Recorrente
            console.log(`♻️ Lead já existe (${existingLead.lead}), marcando como Recorrente`);
            
            const { error: updateError } = await supabase
              .from('leads_prospeccao')
              .update({ 
                status: 'Recorrente',
                updated_at: new Date().toISOString()
              })
              .eq('id', lead.id);
            
            if (updateError) {
              console.error('❌ Erro ao atualizar status:', updateError);
              insertErrors.push({ empresa: lead.empresa, error: updateError.message });
            } else {
              recurrentCount++;
              console.log(`✅ Lead marcado como Recorrente: ${lead.empresa}`);
            }
          } else {
            // Novo lead - inserir com número sequencial
            lead.lead = formatLeadNumber(nextLeadNumber);
            console.log(`🆕 Novo lead: ${lead.lead} - ${lead.empresa}`);
            console.log('📦 Dados:', {
              id: lead.id,
              empresa: lead.empresa,
              cidade: lead.cidade,
              telefone: lead.telefone_whatsapp,
              link: lead.link_gmn
            });
            
            const { error: insertError } = await supabase
              .from('leads_prospeccao')
              .insert(lead);
            
            if (insertError) {
              console.error('❌ Erro ao inserir lead:', insertError);
              insertErrors.push({ empresa: lead.empresa, error: insertError.message });
            } else {
              insertedCount++;
              nextLeadNumber++; // Incrementar para o próximo
              console.log(`✅ Novo lead inserido: ${lead.lead} - ${lead.empresa}`);
            }
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          console.error(`❌ Erro ao processar lead ${lead.empresa}:`, errorMsg);
          insertErrors.push({ empresa: lead.empresa, error: errorMsg });
        }
      }
    }

    console.log('\n✅ ========== PROSPECÇÃO FINALIZADA ==========');
    console.log(`📊 Leads novos inseridos: ${insertedCount}`);
    console.log(`♻️ Leads recorrentes atualizados: ${recurrentCount}`);
    console.log(`❌ Erros durante inserção: ${insertErrors.length}`);
    console.log(`⚠️ Falhas no processamento: ${failedPlaces.length}`);
    console.log('===============================================\n');

    const responseData = {
      success: true,
      message: 'Prospecção realizada com sucesso!',
      insertedCount,
      recurrentCount,
      total: insertedCount + recurrentCount,
      count: insertedCount + recurrentCount, // Para compatibilidade com frontend antigo
      processedTotal: leadsToInsert.length,
      failedProcessing: failedPlaces.length,
      failedInsertion: insertErrors.length,
      details: {
        failedPlaces: failedPlaces.length > 0 ? failedPlaces : undefined,
        insertErrors: insertErrors.length > 0 ? insertErrors : undefined
      }
    };

    return new Response(
      JSON.stringify(responseData),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('\n❌ ========== ERRO FATAL NA PROSPECÇÃO ==========');
    console.error('Mensagem:', errorMessage);
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('===============================================\n');
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
