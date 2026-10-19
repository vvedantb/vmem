import { aesGcmDecrypt, aesGcmEncrypt, requiredEnv } from "@vvedantb/server";
import { decodeBase64Bytes, encodeBase64Bytes } from "./base64";

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyBytes = decodeBase64Bytes(requiredEnv("ENCRYPTION_KEY"));
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptToken(token: string): Promise<string> {
  const { iv, ciphertext } = await aesGcmEncrypt(
    await getEncryptionKey(),
    token,
  );
  return `v1:${encodeBase64Bytes(iv)}:${encodeBase64Bytes(ciphertext)}`;
}

export async function decryptToken(encryptedToken: string): Promise<string> {
  const [version, ivB64, encB64, ...rest] = encryptedToken.split(":");
  if (rest.length > 0 || version !== "v1" || !ivB64 || !encB64) {
    throw new Error("Invalid encrypted token format");
  }
  const key = await getEncryptionKey();
  const decrypted = await aesGcmDecrypt(key, {
    iv: decodeBase64Bytes(ivB64),
    ciphertext: decodeBase64Bytes(encB64),
  });
  return new TextDecoder().decode(decrypted);
}
