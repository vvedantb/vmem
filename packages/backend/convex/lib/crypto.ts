import { decodeBase64Bytes, encodeBase64Bytes } from "./base64";

export function getEnvOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable`);
  }
  return value;
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyBytes = decodeBase64Bytes(getEnvOrThrow("ENCRYPTION_KEY"));
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptToken(token: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(token),
  );
  return `v1:${encodeBase64Bytes(iv)}:${encodeBase64Bytes(new Uint8Array(encrypted))}`;
}

export async function decryptToken(encryptedToken: string): Promise<string> {
  const [version, ivB64, encB64, ...rest] = encryptedToken.split(":");
  if (rest.length > 0 || version !== "v1" || !ivB64 || !encB64) {
    throw new Error("Invalid encrypted token format");
  }
  const key = await getEncryptionKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64Bytes(ivB64) },
    key,
    decodeBase64Bytes(encB64),
  );
  return new TextDecoder().decode(decrypted);
}
