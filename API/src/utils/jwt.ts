import type { TokenInput, TokenPayload } from "../types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const TOKEN_TTL_SECONDS = 6 * 60 * 60;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function stringToBase64Url(value: string): string {
  return bytesToBase64Url(encoder.encode(value));
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 ? "=".repeat(4 - (base64.length % 4)) : "";
  return base64ToBytes(base64 + pad);
}

function base64UrlToString(value: string): string {
  return decoder.decode(base64UrlToBytes(value));
}

// A chave HMAC é a mesma em todas as requisições do isolate: importa uma vez
// e reaproveita, em vez de repetir o importKey a cada verificação de token.
let cachedKey: { secret: string; key: Promise<CryptoKey> } | null = null;

function hmacKey(secret: string): Promise<CryptoKey> {
  if (!cachedKey || cachedKey.secret !== secret) {
    const key = crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );
    cachedKey = { secret, key };
    // Não guarda uma importação que falhou.
    key.catch(() => {
      if (cachedKey && cachedKey.key === key) cachedKey = null;
    });
  }
  return cachedKey.key;
}

export async function signToken(payload: TokenInput, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const body = { ...payload, iat: now, exp: now + TOKEN_TTL_SECONDS };
  const data = `${stringToBase64Url(JSON.stringify(header))}.${stringToBase64Url(JSON.stringify(body))}`;
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(data));
  return `${data}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyToken(token: string, secret: string): Promise<TokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      base64UrlToBytes(parts[2]),
      encoder.encode(data)
    );
    if (!valid) return null;

    const payload = JSON.parse(base64UrlToString(parts[1])) as TokenPayload;
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export { TOKEN_TTL_SECONDS };
