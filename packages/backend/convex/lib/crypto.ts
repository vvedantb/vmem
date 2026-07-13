/**
 * Shared AES-GCM encryption helpers for OAuth tokens and API keys.
 */

export function getEnvOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable`);
  }
  return value;
}

function base64ToUint8(b64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyBytes = base64ToUint8(getEnvOrThrow("ENCRYPTION_KEY"));
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export async function encryptToken(token: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(token),
  );
  return `v1:${uint8ToBase64(iv)}:${uint8ToBase64(new Uint8Array(encrypted))}`;
}

export async function decryptToken(encryptedToken: string): Promise<string> {
  const [version, ivB64, encB64, ...rest] = encryptedToken.split(":");
  if (rest.length > 0 || version !== "v1" || !ivB64 || !encB64) {
    throw new Error("Invalid encrypted token format");
  }
  const key = await getEncryptionKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToUint8(ivB64) },
    key,
    base64ToUint8(encB64),
  );
  return new TextDecoder().decode(decrypted);
}
