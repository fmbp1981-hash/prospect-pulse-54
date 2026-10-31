/**
 * Adaptador do Google Places (API legada: Find Place, Text Search, Details)
 * com a chave da conexão `prospecting/google_places` da organização.
 *
 * Status diferente de OK/ZERO_RESULTS → GooglePlacesError (só o status; a
 * `error_message` do Google pode citar a chave e não sai daqui).
 */
import { z } from 'zod';
import { withTimeout } from '@/lib/utils/resilience';

const BASE_URL = 'https://maps.googleapis.com/maps/api/place';
const TIMEOUT_MS = 15000;

const DETAILS_FIELDS = [
  'name',
  'formatted_address',
  'formatted_phone_number',
  'international_phone_number',
  'website',
  'rating',
  'user_ratings_total',
  'business_status',
  'types',
  'geometry',
  'editorial_summary',
].join(',');

const placeSummarySchema = z.object({
  place_id: z.string().optional(),
  name: z.string().optional(),
});

const placeDetailsSchema = z.object({
  place_id: z.string().optional(),
  name: z.string().optional(),
  formatted_address: z.string().optional(),
  formatted_phone_number: z.string().optional(),
  international_phone_number: z.string().optional(),
  website: z.string().optional(),
  types: z.array(z.string()).optional(),
  geometry: z
    .object({ location: z.object({ lat: z.number(), lng: z.number() }) })
    .optional(),
  editorial_summary: z.object({ overview: z.string().optional() }).optional(),
});

const searchResponseSchema = z.object({
  status: z.string(),
  results: z.array(placeSummarySchema).optional(),
  candidates: z.array(placeSummarySchema).optional(),
});

const detailsResponseSchema = z.object({
  status: z.string(),
  result: placeDetailsSchema.optional(),
});

export type PlaceSummary = z.infer<typeof placeSummarySchema>;
export type PlaceDetails = z.infer<typeof placeDetailsSchema>;

export class GooglePlacesError extends Error {
  readonly status: string;
  constructor(operation: string, status: string) {
    super(`Google Places ${operation}: ${status}`);
    this.name = 'GooglePlacesError';
    this.status = status;
  }
}

async function getJson(url: string, operation: string): Promise<unknown> {
  let res: Response;
  try {
    res = await withTimeout(fetch(url), TIMEOUT_MS, `google_places.${operation}`);
  } catch {
    throw new GooglePlacesError(operation, 'NETWORK_ERROR');
  }
  if (!res.ok) throw new GooglePlacesError(operation, `HTTP_${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new GooglePlacesError(operation, 'INVALID_RESPONSE');
  }
}

function ensureSearchOk(operation: string, status: string): void {
  if (status !== 'OK' && status !== 'ZERO_RESULTS') throw new GooglePlacesError(operation, status);
}

export function createGooglePlacesAdapter(apiKey: string) {
  const key = encodeURIComponent(apiKey);

  return {
    /** Busca por nome do estabelecimento (mais precisa que Text Search). */
    async findPlace(input: string): Promise<PlaceSummary[]> {
      const url =
        `${BASE_URL}/findplacefromtext/json?input=${encodeURIComponent(input)}` +
        `&inputtype=textquery&fields=place_id,name,formatted_address,geometry&key=${key}`;
      const data = searchResponseSchema.parse(await getJson(url, 'find_place'));
      ensureSearchOk('find_place', data.status);
      return data.candidates ?? [];
    },

    /** Busca por nicho + localização. */
    async textSearch(query: string): Promise<PlaceSummary[]> {
      const url = `${BASE_URL}/textsearch/json?query=${encodeURIComponent(query)}&key=${key}`;
      const data = searchResponseSchema.parse(await getJson(url, 'text_search'));
      ensureSearchOk('text_search', data.status);
      return data.results ?? [];
    },

    /** Detalhes de um lugar; status diferente de OK → GooglePlacesError. */
    async details(placeId: string): Promise<PlaceDetails> {
      const url =
        `${BASE_URL}/details/json?place_id=${encodeURIComponent(placeId)}` +
        `&fields=${DETAILS_FIELDS}&key=${key}`;
      const data = detailsResponseSchema.parse(await getJson(url, 'place_details'));
      if (data.status !== 'OK' || !data.result) throw new GooglePlacesError('place_details', data.status);
      return data.result;
    },
  };
}

export type GooglePlacesAdapter = ReturnType<typeof createGooglePlacesAdapter>;
