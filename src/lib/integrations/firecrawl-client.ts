/**
 * Cliente Firecrawl (API v2) — usado só para enriquecimento de site
 * institucional (fallback quando LinkedIn não traz email/telefone).
 * NÃO usado para o canal LinkedIn — ver references/architecture.md, seção 9.
 */

const FIRECRAWL_BASE_URL = 'https://api.firecrawl.dev/v2';

export interface FirecrawlMapLink {
  url: string;
  title?: string;
  description?: string;
}

export interface ContactPageExtraction {
  email: string | null;
  phone: string | null;
}

// O modelo de extração às vezes devolve a STRING "null" (ou variantes) em vez
// do valor JSON null quando não acha o dado — confirmado testando contra
// página real (apify.com/contact-sales). Nunca gravar isso como valor válido.
const NON_VALUES = new Set(['null', 'n/a', 'na', 'none', 'não informado', 'nao informado', '']);

function cleanExtractedValue(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (NON_VALUES.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

async function firecrawlFetch<T>(apiKey: string, path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${FIRECRAWL_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Firecrawl ${path} falhou: ${res.status} ${text}`);
  }

  return res.json() as Promise<T>;
}

export const firecrawlClient = {
  /**
   * Descobre as URLs de um domínio (1 crédito por chamada, até 100k links).
   * Sem `search`, o /map retorna as páginas mais populares/indexadas do
   * domínio — em sites grandes, isso pode NUNCA incluir a página de contato
   * (confirmado testando contra domínios reais). Por isso fazemos uma
   * segunda chamada com `search: 'contact'` para direcionar o resultado.
   */
  async mapDomain(apiKey: string, domain: string): Promise<FirecrawlMapLink[]> {
    const url = domain.startsWith('http') ? domain : `https://${domain}`;

    const [general, contactBiased] = await Promise.all([
      firecrawlFetch<{ success: boolean; links: FirecrawlMapLink[] }>(apiKey, '/map', { url, limit: 100 }),
      firecrawlFetch<{ success: boolean; links: FirecrawlMapLink[] }>(apiKey, '/map', {
        url,
        search: 'contact',
        limit: 50,
      }),
    ]);

    const seen = new Set<string>();
    const merged: FirecrawlMapLink[] = [];
    for (const link of [...(contactBiased.links ?? []), ...(general.links ?? [])]) {
      if (seen.has(link.url)) continue;
      seen.add(link.url);
      merged.push(link);
    }
    return merged;
  },

  /**
   * Extrai email/telefone de uma página via schema JSON (LLM).
   * Retorna null nos campos que a página não tiver — não inventa dado.
   */
  async extractContactInfo(apiKey: string, pageUrl: string): Promise<ContactPageExtraction> {
    const data = await firecrawlFetch<{
      success: boolean;
      data?: { json?: ContactPageExtraction };
    }>(apiKey, '/scrape', {
      url: pageUrl,
      formats: [
        {
          type: 'json',
          schema: {
            type: 'object',
            properties: {
              email: { type: ['string', 'null'], description: 'E-mail de contato publicado na página, se houver' },
              phone: { type: ['string', 'null'], description: 'Telefone de contato publicado na página, se houver' },
            },
            required: ['email', 'phone'],
          },
          prompt: 'Extraia o e-mail e telefone de contato publicados nesta página, se existirem. Não invente valores.',
        },
      ],
      onlyMainContent: true,
    });

    return {
      email: cleanExtractedValue(data.data?.json?.email),
      phone: cleanExtractedValue(data.data?.json?.phone),
    };
  },
};

/**
 * Caminhos de página com maior chance de ter contato publicado.
 * Usado para filtrar o resultado de mapDomain() antes de gastar scrape.
 */
export const CONTACT_PAGE_PATTERNS = [
  'contato', 'contact', 'fale-conosco', 'fale_conosco', 'about', 'sobre',
  'team', 'equipe', 'quem-somos', 'quemsomos',
];

function pathSegments(url: string): string[] | null {
  try {
    return new URL(url).pathname.toLowerCase().split('/').filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * Compara por SEGMENTO de path (ex: "/contato", "/sobre-nos"), não por
 * substring solta na URL inteira — evita falso-positivo tipo "team" dentro
 * de "/blog/introducing-teams" (post de blog, não página de contato).
 *
 * Ordena por profundidade de path (menos segmentos primeiro): confirmado
 * testando contra site real (apify.com) que páginas de produto/marketplace
 * com "contact" no nome (ex: /usuario/contact-info-scraper) aparecem antes
 * da página institucional real (/contact-sales) se não priorizarmos path raso.
 */
export function filterCandidateContactPages(links: FirecrawlMapLink[]): FirecrawlMapLink[] {
  return links
    .filter(link => {
      const segments = pathSegments(link.url);
      if (!segments) return false;
      return segments.some(segment =>
        CONTACT_PAGE_PATTERNS.some(pattern => segment === pattern || segment.startsWith(`${pattern}-`))
      );
    })
    .sort((a, b) => (pathSegments(a.url)?.length ?? 99) - (pathSegments(b.url)?.length ?? 99));
}
