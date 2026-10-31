/**
 * Cofre de segredos dos conectores: AES-256-GCM via Web Crypto.
 *
 * Roda em Node 18+ e em Cloudflare Workers (sem node:crypto/Buffer).
 * Chaves mestras vêm do ambiente: versão `v1` -> CONNECTORS_MASTER_KEY_V1
 * (32 bytes em base64). A versão usada para cifrar é CONNECTORS_ACTIVE_KEY_VERSION
 * (padrão `v1`); segredos antigos continuam decifráveis enquanto a chave da
 * versão em que foram cifrados existir.
 */

export interface EncryptedSecret {
  /** Versão da chave mestra (ex.: "v1"). */
  v: string;
  /** IV de 12 bytes, base64. */
  iv: string;
  /** Texto cifrado + tag GCM, base64. */
  ct: string;
}

export class MasterKeyMissingError extends Error {
  constructor(public readonly version: string) {
    super(`Chave mestra de conectores ausente: CONNECTORS_MASTER_KEY_${version.toUpperCase()}`);
    this.name = 'MasterKeyMissingError';
  }
}

const IV_BYTES = 12;
const KEY_BYTES = 32;
const DEFAULT_ACTIVE_VERSION = 'v1';

// Cache por valor bruto da chave (não por versão): rotacionar/trocar a env
// nunca devolve uma CryptoKey obsoleta.
const keyCache = new Map<string, Promise<CryptoKey>>();

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function importKey(rawB64: string, version: string): Promise<CryptoKey> {
  const raw = fromBase64(rawB64.trim());
  if (raw.length !== KEY_BYTES) {
    throw new Error(
      `CONNECTORS_MASTER_KEY_${version.toUpperCase()} deve ter ${KEY_BYTES} bytes (base64); recebido ${raw.length}`,
    );
  }
  return globalThis.crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function getKey(version: string): Promise<CryptoKey> {
  const rawB64 = process.env[`CONNECTORS_MASTER_KEY_${version.toUpperCase()}`];
  if (!rawB64 || !rawB64.trim()) throw new MasterKeyMissingError(version);

  let pending = keyCache.get(rawB64);
  if (!pending) {
    pending = importKey(rawB64, version);
    keyCache.set(rawB64, pending);
    // Chave inválida não fica em cache.
    pending.catch(() => keyCache.delete(rawB64));
  }
  return pending;
}

function activeVersion(): string {
  return process.env.CONNECTORS_ACTIVE_KEY_VERSION?.trim() || DEFAULT_ACTIVE_VERSION;
}

export async function encryptSecret(plaintext: string): Promise<EncryptedSecret> {
  const v = activeVersion();
  const key = await getKey(v);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(new ArrayBuffer(IV_BYTES)));
  const ct = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { v, iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) };
}

export async function decryptSecret(enc: EncryptedSecret): Promise<string> {
  const key = await getKey(enc.v);
  const pt = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(enc.iv) },
    key,
    fromBase64(enc.ct),
  );
  return new TextDecoder().decode(pt);
}

export function encryptJson<T>(value: T): Promise<EncryptedSecret> {
  return encryptSecret(JSON.stringify(value));
}

export async function decryptJson<T>(enc: EncryptedSecret): Promise<T> {
  return JSON.parse(await decryptSecret(enc)) as T;
}
