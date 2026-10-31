/**
 * Prospecção Google Places pela conexão da organização (substitui a edge
 * function `prospection`).
 *
 * Fluxo: Find Place (busca por nome, 1 resultado) ou Text Search (nicho +
 * localização) → Details em paralelo → filtro de bairros → deduplicação por
 * `id` (place_id) na organização → mensagem de abordagem (LLM da organização,
 * ou o modelo neutro sem ela) → inserção com numeração `Lead-NNN` da
 * organização.
 *
 * Sem verificação de número: whatsapp = telefone. Logs só com contagens.
 */
import { resolveConnection } from '@/lib/connectors/resolve-connection';
import { recordUsage } from '@/lib/connectors/usage';
import { ConnectionNotConfiguredError } from '@/lib/connectors/types';
import {
  createGooglePlacesAdapter,
  type GooglePlacesAdapter,
  type PlaceDetails,
  type PlaceSummary,
} from '@/lib/connectors/prospecting/google-places.adapter';
import {
  resolveLlmForOrganization,
  runWithLlm,
  recordLlmUsage,
  toLlmHttpError,
  type LlmContext,
  type LlmUsage,
} from '@/lib/ai/openai-key-context';
import { getLlmCircuit, countsAsLlmFailure, withTimeout } from '@/lib/utils/resilience';
import type {
  ProspectedLeadInsert,
  ProspectedLeadsRepository,
} from '@/lib/repositories/prospected-leads.repository';
import type { PlacesProspectingInput } from '@/lib/validations/places-prospecting.validation';

export interface PlacesProspectingResult {
  insertedCount: number;
  recurrentCount: number;
  total: number;
  processedTotal: number;
  failedProcessing: number;
  failedInsertion: number;
}

export interface PlacesProspectingParams {
  organizationId: string;
  userId: string;
  input: PlacesProspectingInput;
  leads: ProspectedLeadsRepository;
}

const LLM_TIMEOUT_MS = 20000;
const LLM_DEFAULT_MODEL = 'gpt-4o-mini';

const MESSAGE_SYSTEM_PROMPT =
  'Você é um assistente de prospecção comercial. Reescreva a mensagem mantendo o tom cordial, profissional e neutro. Mantenha os emojis. Não invente nome de empresa remetente, produtos, preços ou dados. A mensagem deve ter no máximo 300 caracteres e ser natural, como se fosse escrita por uma pessoa.';

// ─── Texto e endereço ────────────────────────────────────────────────────────

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nome do resultado corresponde ao nome buscado (exato, contido ou todas as palavras). */
export function isNameMatch(searchName: string, resultName: string): boolean {
  const search = normalizeText(searchName);
  const result = normalizeText(resultName);
  if (result === search || result.includes(search)) return true;
  const searchWords = search.split(' ').filter((w) => w.length > 2);
  const resultWords = result.split(' ');
  return (
    searchWords.length > 0 &&
    searchWords.every((word) => resultWords.some((rw) => rw.includes(word) || word.includes(rw)))
  );
}

/** Cidade a partir do endereço BR ("Rua X, 123 - Bairro, Cidade - UF, CEP, Brasil"). */
export function extractCity(address: string | undefined, fallback: string): string {
  if (!address) return fallback || 'Não informada';
  const parts = address.split(',').map((p) => p.trim());
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (/^\d{5}-?\d{3}$/.test(part)) continue;
    if (part.toLowerCase() === 'brasil' || part.toLowerCase() === 'brazil') continue;
    const cityState = part.match(/^(.+?)\s*-\s*([A-Z]{2})$/);
    if (cityState) return cityState[1].trim();
    if (!/^\d/.test(part) && part.length > 2 && i < parts.length - 1) return part;
  }
  return fallback || 'Não informada';
}

/** Bairro a partir do endereço BR. */
export function extractNeighborhood(address: string | undefined): string {
  if (!address) return '';
  const dashMatch = address.match(/\d+\s*-\s*([^,]+)/);
  if (dashMatch) {
    const bairro = dashMatch[1].trim();
    if (!/^[A-Z]{2}$/.test(bairro)) return bairro;
  }
  const parts = address.split(',').map((p) => p.trim());
  if (parts.length >= 3) {
    if (!/^\d/.test(parts[1])) return parts[1];
    if (parts.length >= 4 && !/^\d/.test(parts[2])) return parts[2];
  }
  return '';
}

const GOOGLE_TYPE_LABELS: Record<string, string> = {
  restaurant: 'Restaurante', food: 'Alimentação', store: 'Loja', beauty_salon: 'Salão de Beleza',
  hair_care: 'Cabeleireiro', gym: 'Academia', dentist: 'Dentista', doctor: 'Médico', lawyer: 'Advogado',
  accounting: 'Contabilidade', car_repair: 'Oficina Mecânica', car_dealer: 'Concessionária',
  car_wash: 'Lava Jato', lodging: 'Hotel/Pousada', cafe: 'Cafeteria', bar: 'Bar', pharmacy: 'Farmácia',
  bakery: 'Padaria', clothing_store: 'Loja de Roupas', shoe_store: 'Loja de Calçados',
  jewelry_store: 'Joalheria', electronics_store: 'Loja de Eletrônicos', furniture_store: 'Loja de Móveis',
  home_goods_store: 'Loja de Casa', pet_store: 'Pet Shop', veterinary_care: 'Veterinária',
  real_estate_agency: 'Imobiliária', insurance_agency: 'Seguradora', bank: 'Banco', atm: 'Caixa Eletrônico',
  supermarket: 'Supermercado', grocery_or_supermarket: 'Mercado', convenience_store: 'Conveniência',
  gas_station: 'Posto de Combustível', hospital: 'Hospital', health: 'Saúde', spa: 'Spa',
  florist: 'Floricultura', travel_agency: 'Agência de Viagens', school: 'Escola', university: 'Universidade',
  church: 'Igreja', meal_delivery: 'Delivery', meal_takeaway: 'Comida para Viagem',
  night_club: 'Casa Noturna', shopping_mall: 'Shopping', department_store: 'Loja de Departamentos',
  laundry: 'Lavanderia', locksmith: 'Chaveiro', moving_company: 'Mudanças', painter: 'Pintor',
  plumber: 'Encanador', electrician: 'Eletricista', roofing_contractor: 'Telhados',
  general_contractor: 'Empreiteiro', ice_cream_shop: 'Sorveteria', liquor_store: 'Loja de Bebidas',
  book_store: 'Livraria', hardware_store: 'Loja de Ferragens', bicycle_store: 'Loja de Bicicletas',
  movie_theater: 'Cinema', museum: 'Museu', amusement_park: 'Parque de Diversões', aquarium: 'Aquário',
  zoo: 'Zoológico', campground: 'Camping', rv_park: 'Área de Camping', parking: 'Estacionamento',
  taxi_stand: 'Ponto de Táxi', transit_station: 'Estação de Transporte', train_station: 'Estação de Trem',
  bus_station: 'Rodoviária', airport: 'Aeroporto',
};

export function translateGoogleType(types: string[] | undefined): string {
  if (!types || types.length === 0) return 'Estabelecimento';
  for (const type of types) {
    if (GOOGLE_TYPE_LABELS[type]) return GOOGLE_TYPE_LABELS[type];
  }
  return types[0].replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Mensagem de abordagem ───────────────────────────────────────────────────

/** Modelo neutro de abordagem (sem empresa remetente, produto ou preço). */
export function buildNeutralMessage(nomeEmpresa: string, categoria: string, cidade: string): string {
  const modelos = [
    `Olá, ${nomeEmpresa}! 👋
Vi que vocês atuam como ${categoria} em ${cidade} e achei que poderia ser interessante apresentar o nosso trabalho.
Caso faça sentido, posso te conectar com um consultor para explicar como podemos apoiar o crescimento do seu negócio. 😊`,
    `Oi, ${nomeEmpresa}! Tudo bem? 🙂
Percebi que vocês são ${categoria} aí em ${cidade}.
Temos ajudado empresas desse segmento a ganhar tempo e resultado no dia a dia.
Se quiser conhecer um pouco mais, posso te colocar em contato com um consultor.`,
    `Olá, ${nomeEmpresa}! 👋
Vi que vocês atuam como ${categoria} em ${cidade}.
Trabalhamos com empresas desse perfil e acredito que podemos ajudar.
Posso pedir para um consultor te enviar mais informações?`,
  ];
  return modelos[Math.floor(Math.random() * modelos.length)];
}

/** Reescreve o modelo com a LLM da organização (circuito por conexão, tokens registrados). */
async function rewriteWithLlm(llm: LlmContext, template: string): Promise<string> {
  return runWithLlm(llm, () =>
    getLlmCircuit(llm.connectionId).call(async () => {
      const response = await withTimeout(
        fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${llm.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: llm.model ?? LLM_DEFAULT_MODEL,
            messages: [
              { role: 'system', content: MESSAGE_SYSTEM_PROMPT },
              { role: 'user', content: `Reescreva esta mensagem de forma natural:\n\n${template}` },
            ],
            max_tokens: 200,
          }),
        }),
        LLM_TIMEOUT_MS,
        'prospecting.message'
      );
      if (!response.ok) throw await toLlmHttpError(response, 'OpenAI API error');
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
        usage?: LlmUsage;
      };
      await recordLlmUsage(data.usage, 'prospecting.message');
      return data.choices?.[0]?.message?.content?.trim() || template;
    }, countsAsLlmFailure)
  );
}

/** LLM da organização, ou null sem conexão (a prospecção segue com o modelo neutro). */
async function resolveOptionalLlm(organizationId: string): Promise<LlmContext | null> {
  try {
    return await resolveLlmForOrganization(organizationId);
  } catch (err) {
    if (err instanceof ConnectionNotConfiguredError) return null;
    console.warn('[prospecting/places] llm_unavailable', {
      organizationId,
      reason: err instanceof Error ? err.name : 'erro',
    });
    return null;
  }
}

async function generateMessage(
  llm: LlmContext | null,
  empresa: string,
  categoria: string,
  cidade: string
): Promise<{ text: string; usedFallback: boolean }> {
  const template = buildNeutralMessage(empresa, categoria, cidade);
  if (!llm) return { text: template, usedFallback: false };
  try {
    return { text: await rewriteWithLlm(llm, template), usedFallback: false };
  } catch {
    return { text: template, usedFallback: true };
  }
}

// ─── Busca ────────────────────────────────────────────────────────────────────

function formatLocation(location: PlacesProspectingInput['location']): string {
  if (!location) return '';
  if (typeof location === 'string') return location;
  if (!location.city) return '';
  return `${location.city}${location.state ? `, ${location.state}` : ''}${location.country ? `, ${location.country}` : ''}`;
}

function neighborhoodOf(location: PlacesProspectingInput['location']): string {
  return location && typeof location !== 'string' && location.neighborhood ? ` ${location.neighborhood}` : '';
}

function formatLeadNumber(num: number): string {
  return `Lead-${String(num).padStart(3, '0')}`;
}

function nextLeadNumber(lastRef: string | null): number {
  const match = lastRef?.match(/Lead-(\d+)/);
  return match ? parseInt(match[1], 10) + 1 : 1;
}

function googleMapsLink(placeId: string, details: PlaceDetails): string | null {
  if (placeId) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(details.name ?? '')}&query_place_id=${placeId}`;
  }
  const loc = details.geometry?.location;
  return loc ? `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}` : null;
}

async function searchPlaces(
  google: GooglePlacesAdapter,
  input: PlacesProspectingInput,
  locationQuery: string,
  track: (operation: string, quantity: number) => Promise<void>
): Promise<PlaceSummary[]> {
  const neighborhood = neighborhoodOf(input.location);
  if (input.businessName) {
    const query = locationQuery ? `${input.businessName} ${locationQuery}${neighborhood}` : input.businessName;
    const candidates = await google.findPlace(query);
    await track('find_place', 1);
    const businessName = input.businessName;
    return candidates.filter((c) => isNameMatch(businessName, c.name ?? '')).slice(0, 1);
  }
  const results = await google.textSearch(`${input.niche} em ${locationQuery}${neighborhood}`);
  await track('text_search', 1);
  return results.slice(0, input.quantity);
}

const UNIQUE_VIOLATION = '23505';
const LEAD_NUMBER_CONSTRAINT = 'leads_prospeccao_lead_key';
const WHATSAPP_CONSTRAINT = 'idx_leads_whatsapp_unique';
const MAX_LEAD_NUMBER_ATTEMPTS = 5;

/**
 * Insere um lead com o próximo `Lead-NNN` livre. `lead` é UNIQUE global:
 * conflito no número avança para o seguinte e regrava (até 5 tentativas),
 * nunca repetindo um número que já colidiu. `whatsapp` também é UNIQUE
 * global: conflito nele regrava o mesmo lead com `whatsapp: null` (o número
 * continua em `telefone`).
 */
async function insertLead(
  leads: ProspectedLeadsRepository,
  lead: Omit<ProspectedLeadInsert, 'lead'>,
  startNumber: number
): Promise<{ ok: boolean; nextNumber: number; code?: string; constraint?: string }> {
  let number = startNumber;
  let row = lead;
  let numberAttempts = 0;
  for (;;) {
    const result = await leads.insert({ ...row, lead: formatLeadNumber(number) });
    if (result.ok) return { ok: true, nextNumber: number + 1 };
    if (result.code === UNIQUE_VIOLATION && result.constraint === LEAD_NUMBER_CONSTRAINT) {
      number++;
      numberAttempts++;
      if (numberAttempts >= MAX_LEAD_NUMBER_ATTEMPTS) {
        return { ok: false, nextNumber: number, code: result.code, constraint: result.constraint };
      }
      continue;
    }
    if (result.code === UNIQUE_VIOLATION && result.constraint === WHATSAPP_CONSTRAINT && row.whatsapp) {
      row = { ...row, whatsapp: null };
      continue;
    }
    return { ok: false, nextNumber: number, code: result.code, constraint: result.constraint };
  }
}

export async function prospectPlaces(params: PlacesProspectingParams): Promise<PlacesProspectingResult> {
  const { organizationId, userId, input, leads } = params;

  // Sem conexão google_places → ConnectionNotConfiguredError (rota: 409).
  const connection = await resolveConnection(organizationId, 'prospecting', 'google_places');
  const google = createGooglePlacesAdapter(connection.secret.apiKey);
  const track = (operation: string, quantity: number) =>
    recordUsage({
      organizationId,
      category: 'prospecting',
      provider: 'google_places',
      operation,
      quantity,
      unit: 'requests',
      connectionId: connection.id,
    });

  const locationQuery = formatLocation(input.location);
  const places = await searchPlaces(google, input, locationQuery, track);

  // Details em paralelo; falha de um lugar não derruba a busca.
  let failedProcessing = 0;
  let detailsCalls = 0;
  const detailed = await Promise.all(
    places.map(async (place) => {
      if (!place.place_id) {
        failedProcessing++;
        return null;
      }
      detailsCalls++;
      try {
        return { placeId: place.place_id, details: await google.details(place.place_id) };
      } catch {
        failedProcessing++;
        return null;
      }
    })
  );
  if (detailsCalls > 0) await track('place_details', detailsCalls);

  const today = new Date().toLocaleDateString('pt-BR');
  let candidates = detailed
    .filter((d): d is { placeId: string; details: PlaceDetails } => d !== null)
    .map(({ placeId, details }) => {
      const phone = details.international_phone_number || details.formatted_phone_number || '';
      return {
        id: placeId,
        empresa: details.name || 'Empresa não identificada',
        categoria: input.niche || translateGoogleType(details.types),
        telefone: phone || null,
        whatsapp: phone || null,
        endereco: details.formatted_address || '',
        cidade: extractCity(details.formatted_address, locationQuery),
        bairro_regiao: extractNeighborhood(details.formatted_address),
        website: details.website || null,
        link_gmn: googleMapsLink(placeId, details),
        status_msg_wa: 'not_sent',
        status: 'Novo',
        estagio_pipeline: 'Novo Lead',
        data: today,
        resumo_analitico: details.editorial_summary?.overview || null,
        user_id: userId,
        organization_id: organizationId,
      };
    });

  if (input.bairros && input.bairros.length > 0) {
    const bairros = input.bairros.map((b) => b.trim().toLowerCase()).filter(Boolean);
    candidates = candidates.filter((lead) => {
      const bairro = lead.bairro_regiao.toLowerCase();
      const endereco = lead.endereco.toLowerCase();
      return bairros.some((b) => bairro.includes(b) || endereco.includes(b));
    });
  }

  const processedTotal = candidates.length;
  let insertedCount = 0;
  let recurrentCount = 0;
  let failedInsertion = 0;
  let llmFallbacks = 0;

  if (candidates.length > 0) {
    const existing = await leads.findExistingIds(organizationId, candidates.map((c) => c.id));
    if (!existing) {
      failedInsertion = candidates.length;
    } else {
      const fresh = candidates.filter((c) => !existing.has(c.id));
      recurrentCount = candidates.length - fresh.length;

      const llm = fresh.some((c) => c.telefone) ? await resolveOptionalLlm(organizationId) : null;
      const withMessages: Array<Omit<ProspectedLeadInsert, 'lead'>> = await Promise.all(
        fresh.map(async (lead) => {
          if (!lead.telefone) return { ...lead, mensagem_whatsapp: null };
          const message = await generateMessage(llm, lead.empresa, lead.categoria, lead.cidade);
          if (message.usedFallback) llmFallbacks++;
          return { ...lead, mensagem_whatsapp: message.text };
        })
      );

      let next = withMessages.length > 0 ? nextLeadNumber(await leads.findLastGlobalLeadRef()) : 1;
      for (const lead of withMessages) {
        const outcome = await insertLead(leads, lead, next);
        next = outcome.nextNumber;
        if (outcome.ok) {
          insertedCount++;
        } else {
          failedInsertion++;
          console.error('[prospecting/places] insert_failed', {
            organizationId,
            code: outcome.code,
            constraint: outcome.constraint,
          });
        }
      }
    }
  }

  console.info('[prospecting/places] concluída', {
    organizationId,
    mode: input.businessName ? 'business_name' : 'niche',
    found: places.length,
    processedTotal,
    insertedCount,
    recurrentCount,
    failedProcessing,
    failedInsertion,
    llmFallbacks,
  });

  return {
    insertedCount,
    recurrentCount,
    total: insertedCount + recurrentCount,
    processedTotal,
    failedProcessing,
    failedInsertion,
  };
}
