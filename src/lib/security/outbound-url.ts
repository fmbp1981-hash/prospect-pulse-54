/**
 * Validação de URL de saída configurada pelo tenant (S1-F-01, SSRF).
 *
 * Usada antes de qualquer fetch para uma URL que vem de user_settings (ex.:
 * evolution_api_url): sem isso o servidor fazia requisições para a rede
 * interna (metadata da nuvem, localhost, serviços privados) em nome do tenant.
 *
 * Regras:
 *  - só `https:`;
 *  - sem usuário/senha, sem query string e sem fragmento;
 *  - host não pode ser `localhost`, `*.localhost`, `*.local` ou `*.internal`;
 *  - host não pode ser IP literal privado, loopback, link-local, CGNAT,
 *    multicast/reservado, nem IPv6 local (::, ::1, fc00::/7, fe80::/10,
 *    fec0::/10, ff00::/8) ou IPv4 mapeado/compatível em IPv6.
 *
 * Limite conhecido: não resolve DNS. Um hostname público que resolva para IP
 * privado (DNS rebinding) não é barrado aqui; isso fica para a camada de rede
 * (egress/WAF) do Sprint 3.
 */

export class UnsafeOutboundUrlError extends Error {
  constructor(reason: string) {
    super(`URL de saída não permitida: ${reason}`);
    this.name = 'UnsafeOutboundUrlError';
  }
}

const BLOCKED_HOST_SUFFIXES: readonly string[] = ['.localhost', '.local', '.internal'];

function parseIPv4(host: string): number[] | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  const parts = host.split('.').map(Number);
  return parts.every((p) => p >= 0 && p <= 255) ? parts : null;
}

function isBlockedIPv4([a, b, c]: number[]): boolean {
  return (
    a === 0 ||                                  // 0.0.0.0/8
    a === 10 ||                                 // 10.0.0.0/8
    (a === 100 && b >= 64 && b <= 127) ||       // 100.64.0.0/10 (CGNAT)
    a === 127 ||                                // loopback
    (a === 169 && b === 254) ||                 // link-local / metadata
    (a === 172 && b >= 16 && b <= 31) ||        // 172.16.0.0/12
    (a === 192 && b === 0 && c === 0) ||        // 192.0.0.0/24
    (a === 192 && b === 168) ||                 // 192.168.0.0/16
    (a === 198 && (b === 18 || b === 19)) ||    // 198.18.0.0/15
    a >= 224                                    // multicast + reservado + broadcast
  );
}

/** Expande um IPv6 (sem colchetes) para 8 hextets; null se inválido. */
function parseIPv6(host: string): number[] | null {
  let text = host;
  // Notação com IPv4 no final (ex.: ::ffff:10.0.0.1) → dois hextets.
  const v4Match = text.match(/:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4Match) {
    const v4 = parseIPv4(v4Match[1]);
    if (!v4) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    text = `${text.slice(0, -v4Match[1].length)}${hi}:${lo}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const toNums = (s: string) => (s === '' ? [] : s.split(':').map((h) => (/^[0-9a-f]{1,4}$/i.test(h) ? parseInt(h, 16) : NaN)));
  const head = toNums(halves[0]);
  const rest = halves.length === 2 ? toNums(halves[1]) : [];
  if ([...head, ...rest].some((n) => Number.isNaN(n))) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - rest.length;
  if (missing < 1) return null;
  return [...head, ...new Array<number>(missing).fill(0), ...rest];
}

function isBlockedIPv6(h: number[]): boolean {
  const firstSixZero = h.slice(0, 6).every((x) => x === 0);
  if (firstSixZero) return true;                                   // ::, ::1, ::a.b.c.d (compatível)
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) return true; // ::ffff:0:0/96 (IPv4 mapeado)
  if ((h[0] & 0xfe00) === 0xfc00) return true;                     // fc00::/7 (ULA)
  if ((h[0] & 0xffc0) === 0xfe80) return true;                     // fe80::/10 (link-local)
  if ((h[0] & 0xffc0) === 0xfec0) return true;                     // fec0::/10 (site-local)
  if ((h[0] & 0xff00) === 0xff00) return true;                     // ff00::/8 (multicast)
  if (h[0] === 0x64 && h[1] === 0xff9b) {                          // 64:ff9b::/96 (NAT64)
    return isBlockedIPv4([h[6] >> 8, h[6] & 0xff, h[7] >> 8, h[7] & 0xff]);
  }
  return false;
}

export function assertSafeOutboundUrl(raw: string): URL {
  const value = (raw ?? '').trim();
  if (!value) throw new UnsafeOutboundUrlError('vazia');

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UnsafeOutboundUrlError('formato inválido');
  }

  if (url.protocol !== 'https:') throw new UnsafeOutboundUrlError('apenas https é aceito');
  if (url.username || url.password) throw new UnsafeOutboundUrlError('credenciais na URL');
  if (url.search || value.includes('?')) throw new UnsafeOutboundUrlError('query string');
  if (url.hash || value.includes('#')) throw new UnsafeOutboundUrlError('fragmento');

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) throw new UnsafeOutboundUrlError('host ausente');

  if (host === 'localhost' || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UnsafeOutboundUrlError('host local');
  }

  const v4 = parseIPv4(host);
  if (v4 && isBlockedIPv4(v4)) throw new UnsafeOutboundUrlError('IP privado ou reservado');

  if (host.startsWith('[') && host.endsWith(']')) {
    const v6 = parseIPv6(host.slice(1, -1));
    if (!v6) throw new UnsafeOutboundUrlError('IPv6 inválido');
    if (isBlockedIPv6(v6)) throw new UnsafeOutboundUrlError('IPv6 local ou reservado');
  }

  return url;
}
