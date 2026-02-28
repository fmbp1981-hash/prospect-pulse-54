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
  businessName?: string; // Nome específico do estabelecimento (opcional)
  bairros?: string[]; // NOVO: array de bairros para filtro
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

// Função para verificar se número tem WhatsApp via Evolution API
async function checkWhatsAppNumber(
  phone: string,
  evolutionApiUrl?: string,
  evolutionApiKey?: string
): Promise<boolean> {
  // Se não houver configuração da Evolution API, assumir que é WhatsApp
  if (!evolutionApiUrl || !evolutionApiKey) {
    console.log('⚠️ Evolution API não configurada, assumindo que número tem WhatsApp');
    return true;
  }

  try {
    // Limpar número (remover caracteres não numéricos)
    const cleanPhone = phone.replace(/\D/g, '');

    // Verificar se número tem pelo menos 10 dígitos
    if (cleanPhone.length < 10) {
      console.log(`⚠️ Número muito curto: ${phone}`);
      return false;
    }

    console.log(`🔍 Verificando WhatsApp: ${phone}`);

    // Chamar Evolution API para verificar número
    // Endpoint correto: POST /chat/whatsappNumbers/{instance}
    const response = await fetch(evolutionApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey,
      },
      body: JSON.stringify({
        numbers: [cleanPhone], // Evolution API espera array de números
      }),
    });

    if (!response.ok) {
      console.warn(`⚠️ Evolution API retornou erro ${response.status} para ${phone}`);
      return true; // Assumir que é WhatsApp em caso de erro
    }

    const data = await response.json();

    // Evolution API retorna array: [{ exists: true/false, jid: "...", number: "..." }]
    if (Array.isArray(data) && data.length > 0) {
      const result = data[0];
      const hasWhatsApp = result.exists === true;

      console.log(`${hasWhatsApp ? '✅' : '❌'} ${phone} ${hasWhatsApp ? 'TEM' : 'NÃO TEM'} WhatsApp`);

      return hasWhatsApp;
    }

    // Se resposta não é array, assumir que não tem WhatsApp
    console.warn(`⚠️ Resposta inesperada da Evolution API para ${phone}`);
    return false;
  } catch (error) {
    console.error(`❌ Erro ao verificar WhatsApp para ${phone}:`, error);
    return true; // Assumir que é WhatsApp em caso de erro
  }
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

// Mapear tipos do Google Places para categorias legíveis em português
function translateGoogleType(types: string[] | undefined): string {
  if (!types || types.length === 0) return 'Estabelecimento';
  
  const typeMap: Record<string, string> = {
    'restaurant': 'Restaurante',
    'food': 'Alimentação',
    'store': 'Loja',
    'beauty_salon': 'Salão de Beleza',
    'hair_care': 'Cabeleireiro',
    'gym': 'Academia',
    'dentist': 'Dentista',
    'doctor': 'Médico',
    'lawyer': 'Advogado',
    'accounting': 'Contabilidade',
    'car_repair': 'Oficina Mecânica',
    'car_dealer': 'Concessionária',
    'car_wash': 'Lava Jato',
    'lodging': 'Hotel/Pousada',
    'cafe': 'Cafeteria',
    'bar': 'Bar',
    'pharmacy': 'Farmácia',
    'bakery': 'Padaria',
    'clothing_store': 'Loja de Roupas',
    'shoe_store': 'Loja de Calçados',
    'jewelry_store': 'Joalheria',
    'electronics_store': 'Loja de Eletrônicos',
    'furniture_store': 'Loja de Móveis',
    'home_goods_store': 'Loja de Casa',
    'pet_store': 'Pet Shop',
    'veterinary_care': 'Veterinária',
    'real_estate_agency': 'Imobiliária',
    'insurance_agency': 'Seguradora',
    'bank': 'Banco',
    'atm': 'Caixa Eletrônico',
    'supermarket': 'Supermercado',
    'grocery_or_supermarket': 'Mercado',
    'convenience_store': 'Conveniência',
    'gas_station': 'Posto de Combustível',
    'hospital': 'Hospital',
    'health': 'Saúde',
    'spa': 'Spa',
    'florist': 'Floricultura',
    'travel_agency': 'Agência de Viagens',
    'school': 'Escola',
    'university': 'Universidade',
    'church': 'Igreja',
    'meal_delivery': 'Delivery',
    'meal_takeaway': 'Comida para Viagem',
    'night_club': 'Casa Noturna',
    'shopping_mall': 'Shopping',
    'department_store': 'Loja de Departamentos',
    'laundry': 'Lavanderia',
    'locksmith': 'Chaveiro',
    'moving_company': 'Mudanças',
    'painter': 'Pintor',
    'plumber': 'Encanador',
    'electrician': 'Eletricista',
    'roofing_contractor': 'Telhados',
    'general_contractor': 'Empreiteiro',
    'ice_cream_shop': 'Sorveteria',
    'liquor_store': 'Loja de Bebidas',
    'book_store': 'Livraria',
    'hardware_store': 'Loja de Ferragens',
    'bicycle_store': 'Loja de Bicicletas',
    'movie_theater': 'Cinema',
    'museum': 'Museu',
    'amusement_park': 'Parque de Diversões',
    'aquarium': 'Aquário',
    'zoo': 'Zoológico',
    'campground': 'Camping',
    'rv_park': 'Área de Camping',
    'parking': 'Estacionamento',
    'taxi_stand': 'Ponto de Táxi',
    'transit_station': 'Estação de Transporte',
    'train_station': 'Estação de Trem',
    'bus_station': 'Rodoviária',
    'airport': 'Aeroporto',
  };
  
  for (const type of types) {
    if (typeMap[type]) return typeMap[type];
  }
  
  // Se não encontrou mapeamento, formatar o primeiro tipo
  const firstType = types[0];
  return firstType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
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

    const { niche, location, quantity, user_id, businessName, bairros } = await req.json() as ProspectionRequest;

    console.log('📍 Prospecção iniciada:', { niche, location, quantity, user_id, businessName, bairros });

    // Validações - permitir busca só por nome do estabelecimento
    const hasBusinessName = businessName && businessName.trim().length > 0;
    const hasLocation = location && (typeof location === 'string' ? location.trim().length > 0 : location.city?.trim().length > 0);
    
    // Se tem businessName, não precisa de niche nem quantity
    // Se não tem businessName, precisa de niche E location
    if (!hasBusinessName) {
      if (!niche || niche.trim().length === 0) {
        return new Response(
          JSON.stringify({ error: 'Informe o nicho ou o nome do estabelecimento' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (!hasLocation) {
        return new Response(
          JSON.stringify({ error: 'Informe a localização para busca por nicho' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Se buscar por nome do estabelecimento, limitar a 1 resultado para ser assertivo
    let effectiveQuantity = quantity || 50;
    if (hasBusinessName) {
      effectiveQuantity = 1;
      console.log('🎯 Busca por nome de estabelecimento: limitando a 1 resultado');
    }

    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    // Configurações Evolution API: buscar do banco de dados primeiro, fallback para env vars
    let EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL');
    let EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY');

    if (!GOOGLE_API_KEY) {
      console.error('❌ GOOGLE_PLACES_API_KEY não configurada');
      return new Response(
        JSON.stringify({ error: 'API Key do Google Places não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Formatar localização para busca (pode ser vazia se buscando por nome)
    let locationQuery = '';
    if (hasLocation) {
      locationQuery = typeof location === 'string'
        ? location
        : `${location.city}${location.state ? ', ' + location.state : ''}${location.country ? ', ' + location.country : ''}`;
    }

    // Adicionar bairro à query se disponível
    if (typeof location !== 'string' && location?.neighborhood) {
      console.log(`🏘️ Bairro especificado: ${location.neighborhood}`);
    }

    // Função para normalizar texto (remover acentos, hífens, lowercase)
    const normalizeText = (text: string): string => {
      return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[-_]/g, ' ') // Substitui hífens e underscores por espaços
        .replace(/\s+/g, ' ') // Normaliza espaços múltiplos
        .trim();
    };

    // Função para verificar correspondência de nomes
    const isNameMatch = (searchName: string, resultName: string): boolean => {
      const normalizedSearch = normalizeText(searchName);
      const normalizedResult = normalizeText(resultName);

      // Correspondência exata
      if (normalizedResult === normalizedSearch) return true;

      // Verifica se o resultado contém exatamente o nome buscado
      if (normalizedResult.includes(normalizedSearch)) return true;

      // Verifica se todas as palavras do nome buscado estão no resultado
      const searchWords = normalizedSearch.split(' ').filter(w => w.length > 2);
      const resultWords = normalizedResult.split(' ');
      const allWordsMatch = searchWords.every(word =>
        resultWords.some(rw => rw.includes(word) || word.includes(rw))
      );

      return allWordsMatch && searchWords.length > 0;
    };

    // 1. Buscar lugares no Google Places
    // Construir query de forma flexível: nome do estabelecimento OU nicho + localização
    const neighborhoodPart = (typeof location !== 'string' && location?.neighborhood) ? ` ${location.neighborhood}` : '';

    let searchQuery: string;
    let results: any[] = [];

    if (hasBusinessName) {
      // Busca por nome específico do estabelecimento - usar Find Place API (mais precisa)
      const inputQuery = hasLocation
        ? `${businessName} ${locationQuery}${neighborhoodPart}`
        : businessName;

      console.log('🔍 Buscando por nome do estabelecimento:', { businessName, location: locationQuery || 'N/A' });
      console.log('📍 Query de busca completa:', inputQuery);

      // Usar Find Place API para busca mais precisa
      const findPlaceUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(inputQuery)}&inputtype=textquery&fields=place_id,name,formatted_address,geometry&key=${GOOGLE_API_KEY}`;

      const findResponse = await fetch(findPlaceUrl);
      const findData = await findResponse.json();

      if (findData.status !== 'OK' && findData.status !== 'ZERO_RESULTS') {
        console.error('❌ Erro na API Find Place:', findData);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Erro na API do Google: ${findData.status}`,
            details: findData.error_message
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const candidates = findData.candidates || [];
      console.log(`✅ Find Place retornou ${candidates.length} candidatos`);

      // Filtrar apenas resultados que correspondem ao nome buscado
      if (candidates.length > 0) {
        const matchingResults = candidates.filter((candidate: any) => {
          const matches = isNameMatch(businessName, candidate.name || '');
          console.log(`   📋 "${candidate.name}" - ${matches ? '✅ Match' : '❌ Não corresponde'}`);
          return matches;
        });

        if (matchingResults.length > 0) {
          results = matchingResults;
          console.log(`✅ ${matchingResults.length} resultado(s) correspondem ao nome buscado`);
        } else {
          console.log(`⚠️ Nenhum resultado corresponde exatamente a "${businessName}"`);
          // Retornar lista vazia - não queremos resultados que não correspondem
          return new Response(
            JSON.stringify({
              success: true,
              message: `Nenhum estabelecimento encontrado com o nome exato "${businessName}". Verifique a escrita.`,
              insertedCount: 0,
              recurrentCount: 0,
              total: 0,
              count: 0,
              suggestion: candidates.length > 0 ? `Você quis dizer "${candidates[0].name}"?` : undefined
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    } else {
      // Busca tradicional por nicho + localização
      searchQuery = `${niche} em ${locationQuery}${neighborhoodPart}`;
      console.log('🔍 Buscando no Google Places:', { niche, location: locationQuery, neighborhood: neighborhoodPart });
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

      results = searchData.results || [];
    }

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

    // Limitar pela quantidade solicitada (usa effectiveQuantity para busca por nome)
    const limitedResults = results.slice(0, Math.min(effectiveQuantity, results.length));

    // 2. ⚡ OTIMIZADO: Buscar detalhes em PARALELO (muito mais rápido!)
    console.log('\n🔄 Iniciando processamento PARALELO dos leads...');
    const failedPlaces: Array<{ name: string; error: string }> = [];

    const detailsPromises = limitedResults.map(async (place: any) => {
      try {
        if (!place.place_id) {
          console.error('❌ place_id não encontrado para:', place.name);
          failedPlaces.push({ name: place.name, error: 'place_id missing' });
          return null;
        }

        console.log(`🏢 Buscando: ${place.name}`);
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,business_status,types,geometry&key=${GOOGLE_API_KEY}`;

        const detailsResponse = await fetch(detailsUrl);
        const detailsData = await detailsResponse.json();

        if (detailsData.status === 'OK' && detailsData.result) {
          const placeData = detailsData.result;

          // Garantir que place_id existe
          if (!placeData.place_id) {
            placeData.place_id = generateUniqueId(
              placeData.name || 'unknown',
              placeData.formatted_address || ''
            );
          }

          // ⚠️ FIRECRAWL DESABILITADO - Era o maior gargalo (10s+ por lead)
          // Se precisar, ative manualmente editando este comentário

          console.log(`✅ ${place.name}`);
          return placeData;
        } else {
          console.error(`❌ Erro: ${detailsData.status}`);
          failedPlaces.push({ name: place.name, error: detailsData.status });
          return null;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Erro:', errorMsg);
        failedPlaces.push({ name: place.name, error: errorMsg });
        return null;
      }
    });

    // Aguardar TODAS as requisições em paralelo
    const detailedPlacesResults = await Promise.all(detailsPromises);
    const detailedPlaces = detailedPlacesResults.filter((place): place is GooglePlacesResult => place !== null);

    console.log(`✅ ${detailedPlaces.length} leads processados`);
    console.log(`❌ ${failedPlaces.length} falhas`);

    // 3. ⚡ OTIMIZADO: Verificar TODOS os números de WhatsApp de uma vez (batch)
    console.log('🔍 Verificando números WhatsApp em batch...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Cliente autenticado com JWT do usuário (para user_settings e auth.getUser)
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });

    // Cliente service role — usado para inserts em leads_prospeccao (bypassa RLS)
    // user_id é passado explicitamente no insert para garantir isolamento multi-tenant
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Extrair user_id autenticado do JWT
    let effectiveUserId: string | null = user_id || null;
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser?.id) effectiveUserId = authUser.id;
    } catch {
      console.warn('⚠️ Não foi possível extrair user_id do JWT, usando body');
    }
    console.log('👤 user_id efetivo:', effectiveUserId);

    // Buscar configurações do usuário (Evolution API personalizada)
    try {
      const { data: userSettings, error: settingsError } = await supabase
        .from('user_settings')
        .select('evolution_api_url, evolution_api_key')
        .single();

      if (!settingsError && userSettings) {
        // Se usuário tem configurações personalizadas, usar elas
        if (userSettings.evolution_api_url) {
          EVOLUTION_API_URL = userSettings.evolution_api_url;
          console.log('✅ Usando Evolution API URL personalizada do usuário');
        }
        if (userSettings.evolution_api_key) {
          EVOLUTION_API_KEY = userSettings.evolution_api_key;
          console.log('✅ Usando Evolution API Key personalizada do usuário');
        }
      } else {
        console.log('ℹ️ Usando Evolution API padrão (env vars)');
      }
    } catch (error) {
      console.warn('⚠️ Erro ao buscar configurações do usuário, usando env vars:', error);
    }

    // Coletar todos os telefones para verificar em batch
    const phonesMap = new Map<string, string>(); // placeId -> phone
    detailedPlaces.forEach(place => {
      const phone = place.international_phone_number || place.formatted_phone_number || '';
      if (phone && place.place_id) {
        phonesMap.set(place.place_id, phone);
      }
    });

    // Verificar TODOS os números de uma vez via Evolution API
    const whatsappResults = new Map<string, boolean>(); // phone -> hasWhatsApp

    if (phonesMap.size > 0 && EVOLUTION_API_URL && EVOLUTION_API_KEY) {
      try {
        const phones = Array.from(phonesMap.values()).map(p => p.replace(/\D/g, ''));
        const response = await fetch(EVOLUTION_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': EVOLUTION_API_KEY,
          },
          body: JSON.stringify({ numbers: phones }),
        });

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data)) {
            data.forEach((result: any) => {
              const originalPhone = Array.from(phonesMap.values()).find(p =>
                p.replace(/\D/g, '') === result.number
              );
              if (originalPhone) {
                whatsappResults.set(originalPhone, result.exists === true);
              }
            });
            console.log(`✅ Verificados ${whatsappResults.size} números`);
          }
        }
      } catch (error) {
        console.warn('⚠️ Erro na verificação batch, assumindo todos como WhatsApp:', error);
      }
    }

    // Filtrar resultados válidos do Google Places
    const validPlaces = detailedPlacesResults.filter((place): place is GooglePlacesResult => place !== null);

    // Extrair cidade da localização formatada
    // Formato típico BR: "Rua X, 123 - Bairro, Cidade - UF, CEP, Brasil"
    // Ou: "Rua X, 123, Bairro, Cidade - UF, CEP, Brasil"
    const extractCity = (address: string | undefined): string => {
      if (!address) return locationQuery || 'Não informada';

      const parts = address.split(',').map(p => p.trim());

      // Procurar parte que contém "Cidade - UF" (ex: "São Paulo - SP")
      for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        // Ignora CEP (só números e hífen), Brasil, e partes muito curtas
        if (/^\d{5}-?\d{3}$/.test(part)) continue; // CEP
        if (part.toLowerCase() === 'brasil' || part.toLowerCase() === 'brazil') continue;

        // Procura padrão "Cidade - UF"
        const cityStateMatch = part.match(/^(.+?)\s*-\s*([A-Z]{2})$/);
        if (cityStateMatch) {
          return cityStateMatch[1].trim();
        }

        // Se não tem hífen mas parece nome de cidade (não é número/CEP)
        if (!/^\d/.test(part) && part.length > 2 && i < parts.length - 1) {
          return part;
        }
      }

      return locationQuery || 'Não informada';
    };

    // Extrair bairro do endereço
    // Formato típico BR: "Rua X, 123 - Bairro, Cidade - UF, CEP, Brasil"
    const extractNeighborhood = (address: string | undefined): string => {
      if (!address) return '';

      // Primeiro, tentar extrair bairro do formato "Rua X, 123 - Bairro"
      const dashMatch = address.match(/\d+\s*-\s*([^,]+)/);
      if (dashMatch) {
        const bairro = dashMatch[1].trim();
        // Verificar se não é UF (2 letras maiúsculas)
        if (!/^[A-Z]{2}$/.test(bairro)) {
          return bairro;
        }
      }

      // Fallback: pegar segundo elemento se existir
      const parts = address.split(',').map(p => p.trim());
      if (parts.length >= 3) {
        // Verificar se o segundo elemento não é número/CEP
        const secondPart = parts[1];
        if (!/^\d/.test(secondPart)) {
          return secondPart;
        }
        // Tentar terceiro elemento
        if (parts.length >= 4 && !/^\d/.test(parts[2])) {
          return parts[2];
        }
      }

      return '';
    };

    // Transformar dados do Google Places para o schema do banco de dados
    let leadsToInsert = await Promise.all(validPlaces.map(async (place) => {
      const phone = place.international_phone_number || place.formatted_phone_number || '';
      const hasWhatsApp = whatsappResults.get(phone) ?? true; // Assumir true se não verificado

      // Gerar mensagem WhatsApp se tiver API key
      let mensagemWhatsApp = '';
      if (LOVABLE_API_KEY && phone) {
        try {
          mensagemWhatsApp = await generateWhatsAppMessage(
            place.name || 'Empresa',
            niche || translateGoogleType(place.types),
            extractCity(place.formatted_address),
            LOVABLE_API_KEY
          );
        } catch (error) {
          console.warn(`⚠️ Erro ao gerar mensagem WhatsApp para ${place.name}:`, error);
        }
      }

      // Gerar link do Google Maps usando place_id ou coordenadas
      let googleMapsLink: string | null = null;
      if (place.place_id) {
        googleMapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name || '')}&query_place_id=${place.place_id}`;
      } else if (place.geometry?.location) {
        googleMapsLink = `https://www.google.com/maps/search/?api=1&query=${place.geometry.location.lat},${place.geometry.location.lng}`;
      }

      return {
        id: place.place_id || generateUniqueId(place.name || 'empresa', place.formatted_address || ''),
        empresa: place.name || 'Empresa não identificada',
        categoria: niche || translateGoogleType(place.types),
        telefone: phone || null,
        whatsapp: hasWhatsApp ? phone : null,
        endereco: place.formatted_address || '',
        cidade: extractCity(place.formatted_address),
        bairro_regiao: extractNeighborhood(place.formatted_address),
        website: place.website || null,
        link_gmn: googleMapsLink,
        mensagem_whatsapp: mensagemWhatsApp || null,
        status_msg_wa: 'not_sent',
        status: 'Novo',
        estagio_pipeline: 'Novo Lead',
        data: new Date().toLocaleDateString('pt-BR'),
        resumo_analitico: place.enrichedSummary || null,
        user_id: effectiveUserId,
      };
    }));

    // Filtrar por bairros se especificado
    if (bairros && Array.isArray(bairros) && bairros.length > 0) {
      const bairrosLower = bairros.map(b => b.trim().toLowerCase());
      leadsToInsert = leadsToInsert.filter(lead => {
        const bairroLead = (lead.bairro_regiao || '').toLowerCase();
        const enderecoLead = (lead.endereco || '').toLowerCase();
        return bairrosLower.some(b => bairroLead.includes(b) || enderecoLead.includes(b));
      });
      console.log(`🏘️ Filtrando leads por bairros: ${bairros.join(", ")}. Restaram ${leadsToInsert.length} leads.`);
    }

    // 4. Salvar no Supabase com verificação de duplicatas
    console.log('\n💾 Salvando leads no Supabase...');
    console.log(`📊 Total de leads para inserir: ${leadsToInsert.length}`);

    let insertedCount = 0;
    let recurrentCount = 0;
    const insertErrors: Array<{ empresa: string; error: string }> = [];

    if (leadsToInsert.length > 0) {
      // Obter próximo número de lead (usa adminSupabase para bypass RLS)
      let nextLeadNumber = await getNextLeadNumber(adminSupabase);
      console.log(`🔢 Iniciando numeração a partir de: Lead-${String(nextLeadNumber).padStart(3, '0')}`);

      for (const lead of leadsToInsert) {
        try {
          // Log detalhado do lead antes de processar
          console.log(`\n📋 Processando lead: ${lead.empresa}`);
          console.log(`🆔 ID do lead: ${lead.id}`);

          // GARANTIR que o ID existe - gerar se necessário
          if (!lead.id) {
            const newId = generateUniqueId(lead.empresa || 'empresa', lead.cidade || 'cidade');
            console.warn(`⚠️ Lead sem ID, gerando: ${newId}`);
            lead.id = newId;
          }

          // Validar dados obrigatórios
          if (!lead.empresa) {
            console.error('❌ Lead sem nome da empresa');
            insertErrors.push({ empresa: 'Unknown', error: 'Missing empresa name' });
            continue;
          }

          console.log(`\n🔍 Verificando duplicata para: ${lead.empresa}`);

          // Verificar se o lead já existe (usa adminSupabase para bypass RLS)
          const { data: existingLead, error: checkError } = await adminSupabase
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
            // Lead já existe - pular sem inserir (evitar duplicatas)
            console.log(`⏭️ Lead já existe (${existingLead.lead}), pulando para evitar duplicata: ${lead.empresa}`);
            recurrentCount++;
          } else {
            // Novo lead - inserir com número sequencial
            const leadNumber = formatLeadNumber(nextLeadNumber);
            const leadToInsert = {
              ...lead,
              lead: leadNumber,
            };
            console.log(`🆕 Novo lead: ${leadNumber} - ${lead.empresa}`);
            console.log('📦 Dados:', {
              id: leadToInsert.id,
              empresa: leadToInsert.empresa,
              cidade: leadToInsert.cidade,
              telefone: leadToInsert.telefone,
              whatsapp: leadToInsert.whatsapp,
              link_gmn: leadToInsert.link_gmn
            });

            const { error: insertError } = await adminSupabase
              .from('leads_prospeccao')
              .insert(leadToInsert);

            if (insertError) {
              console.error('❌ Erro ao inserir lead:', insertError);
              insertErrors.push({ empresa: lead.empresa, error: insertError.message });
            } else {
              insertedCount++;
              nextLeadNumber++; // Incrementar para o próximo
              console.log(`✅ Novo lead inserido: ${leadNumber} - ${lead.empresa}`);
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
    console.log(`⏭️ Leads duplicados pulados: ${recurrentCount}`);
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
