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

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyB64 = getEnvOrThrow("ENCRYPTION_KEY");
  const keyBytes = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
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
  const parts = encryptedToken.split(":");
  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new Error("Invalid encrypted token format");
  }
  const [, ivB64, encB64] = parts;
  const key = await getEncryptionKey();
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const enc = Uint8Array.from(atob(encB64), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    enc,
  );
  return new TextDecoder().decode(decrypted);
}
