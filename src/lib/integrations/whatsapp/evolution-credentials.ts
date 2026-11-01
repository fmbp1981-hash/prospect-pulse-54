/**
 * Endpoint Evolution (URL + API Key) para envio em nome de um tenant.
 *
 * Regra (T9-C1): URL e chave andam SEMPRE juntas e nunca são misturadas.
 *   - URL e chave do tenant, ambas preenchidas → usa as duas;
 *   - nenhuma das duas preenchida → usa URL e chave globais (EVOLUTION_API_*);
 *   - só uma preenchida → null (configuração inválida). Assim a chave global
 *     nunca é enviada para um host escolhido pelo usuário.
 * Strings vazias ou só com espaços contam como ausentes.
 * A instância NÃO vem daqui: é sempre resolveInstanceForUser (coluna protegida).
 */

export interface EvolutionEndpoint {
  apiUrl: string;
  apiKey: string;
}

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

export function resolveEvolutionEndpoint(
  tenantUrl: string | null | undefined,
  tenantKey: string | null | undefined
): EvolutionEndpoint | null {
  const url = clean(tenantUrl);
  const key = clean(tenantKey);

  if (url && key) return { apiUrl: url.replace(/\/$/, ''), apiKey: key };
  if (url || key) return null;

  const globalUrl = clean(process.env.EVOLUTION_API_URL);
  const globalKey = clean(process.env.EVOLUTION_API_KEY);
  if (globalUrl && globalKey) return { apiUrl: globalUrl.replace(/\/$/, ''), apiKey: globalKey };
  return null;
}
