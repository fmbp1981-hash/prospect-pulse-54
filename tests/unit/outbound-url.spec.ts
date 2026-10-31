/**
 * S1-F-01 — assertSafeOutboundUrl: URL de saída vinda de configuração do
 * tenant (ex.: evolution_api_url) não pode apontar para a rede interna.
 */
import { describe, it, expect } from 'vitest';
import { assertSafeOutboundUrl, UnsafeOutboundUrlError } from '@/lib/security/outbound-url';

describe('assertSafeOutboundUrl — aceitas', () => {
  it.each([
    'https://evo.cliente.com.br',
    'https://evo.cliente.com.br/',
    'https://api.exemplo.com:8443/evolution',
    'https://8.8.8.8',
    'https://[2001:4860:4860::8888]/',
  ])('%s', (raw) => {
    const url = assertSafeOutboundUrl(raw);
    expect(url).toBeInstanceOf(URL);
    expect(url.protocol).toBe('https:');
  });

  it('ignora espaços nas pontas', () => {
    expect(assertSafeOutboundUrl('  https://evo.cliente.com.br  ').hostname).toBe('evo.cliente.com.br');
  });
});

describe('assertSafeOutboundUrl — rejeitadas', () => {
  it.each([
    ['vazia', ''],
    ['não é URL', 'evo.cliente.com.br'],
    ['http', 'http://evo.cliente.com.br'],
    ['outro esquema', 'ftp://evo.cliente.com.br'],
    ['file', 'file:///etc/passwd'],
    ['credenciais', 'https://user:senha@evo.cliente.com.br'],
    ['só usuário', 'https://user@evo.cliente.com.br'],
    ['query', 'https://evo.cliente.com.br/?x=1'],
    ['fragmento', 'https://evo.cliente.com.br/#a'],
    ['localhost', 'https://localhost'],
    ['localhost com ponto final', 'https://localhost./'],
    ['subdomínio de localhost', 'https://api.localhost'],
    ['.local', 'https://impressora.local'],
    ['.internal', 'https://metadata.google.internal'],
    ['loopback', 'https://127.0.0.1'],
    ['loopback alternativo', 'https://127.10.0.5'],
    ['loopback decimal', 'https://2130706433'],
    ['loopback hex', 'https://0x7f.0.0.1'],
    ['0.0.0.0', 'https://0.0.0.0'],
    ['privado 10/8', 'https://10.1.2.3'],
    ['privado 172.16/12', 'https://172.20.0.1'],
    ['privado 192.168/16', 'https://192.168.0.10'],
    ['link-local / metadata', 'https://169.254.169.254'],
    ['CGNAT', 'https://100.64.1.1'],
    ['broadcast', 'https://255.255.255.255'],
    ['IPv6 loopback', 'https://[::1]'],
    ['IPv6 não especificado', 'https://[::]'],
    ['IPv6 ULA', 'https://[fd00::1]'],
    ['IPv6 link-local', 'https://[fe80::1]'],
    ['IPv4 mapeado em IPv6', 'https://[::ffff:127.0.0.1]'],
    ['IPv4 mapeado privado', 'https://[::ffff:10.0.0.1]'],
  ])('%s: %s', (_label, raw) => {
    expect(() => assertSafeOutboundUrl(raw)).toThrow(UnsafeOutboundUrlError);
  });
});
