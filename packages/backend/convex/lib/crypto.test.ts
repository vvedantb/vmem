// Pins the stored token format and base64 helpers byte for byte.
// Expected values were computed separately with node:crypto and Buffer.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeBase64Bytes, encodeBase64Bytes, toArrayBuffer } from "./base64";
import { decryptToken, encryptToken } from "./crypto";

// bytes 0..31
const ENCRYPTION_KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
const PLAINTEXT = "ya29.connector-access-token";
const STORED =
  "v1:VGFue4iVoq+8ydbj:ddBbRFrxd2VmXt7fYcIkndEgB7sVc0hSz4slvdc93kQ2rXN0hPuEbQdRyw==";

function fixedRandomValues<T extends ArrayBufferView | null>(array: T): T {
  if (array instanceof Uint8Array) {
    const n = array.length;
    for (let i = 0; i < n; i++) array[i] = (n * 7 + i * 13) & 0xff;
  }
  return array;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

beforeEach(() => {
  vi.stubEnv("ENCRYPTION_KEY", ENCRYPTION_KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("encryptToken", () => {
  it("writes v1:<iv b64>:<ciphertext+tag b64> with a 12-byte random IV", async () => {
    const spy = vi
      .spyOn(crypto, "getRandomValues")
      .mockImplementation(fixedRandomValues);
    expect(await encryptToken(PLAINTEXT)).toBe(STORED);
    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0]?.[0];
    expect(arg).toBeInstanceOf(Uint8Array);
    expect(arg instanceof Uint8Array ? arg.length : -1).toBe(12);
  });

  it("round-trips with a real random IV", async () => {
    const stored = await encryptToken("round trip ✓");
    expect(stored).toMatch(/^v1:[A-Za-z0-9+/]{16}:[A-Za-z0-9+/=]+$/);
    expect(await decryptToken(stored)).toBe("round trip ✓");
  });

  it("throws the env error when ENCRYPTION_KEY is missing", async () => {
    vi.stubEnv("ENCRYPTION_KEY", "");
    await expect(encryptToken(PLAINTEXT)).rejects.toThrow(
      new Error("ENCRYPTION_KEY is not set in Convex env"),
    );
  });

  it("rejects a non-canonical ENCRYPTION_KEY with the @scure/base message", async () => {
    vi.stubEnv("ENCRYPTION_KEY", `${ENCRYPTION_KEY}\n`);
    await expect(encryptToken(PLAINTEXT)).rejects.toThrow(
      new Error("padding: invalid, string should have whole number of bytes"),
    );
  });
});

describe("decryptToken", () => {
  it("decrypts the pinned stored value", async () => {
    expect(await decryptToken(STORED)).toBe(PLAINTEXT);
  });

  it.each([
    "v2:VGFue4iVoq+8ydbj:ddBb",
    "v1:VGFue4iVoq+8ydbj",
    "v1::ddBb",
    "v1:VGFue4iVoq+8ydbj:ddBb:extra",
    "",
  ])("rejects malformed %j before reading the key", async (value) => {
    vi.stubEnv("ENCRYPTION_KEY", "");
    await expect(decryptToken(value)).rejects.toThrow(
      new Error("Invalid encrypted token format"),
    );
  });

  it("rejects a non-canonical IV with the @scure/base message", async () => {
    await expect(decryptToken("v1:Zm9=:ddBb")).rejects.toThrow(
      new Error("Non-zero padding: 64"),
    );
  });

  it("reads the key before decoding the IV", async () => {
    vi.stubEnv("ENCRYPTION_KEY", "");
    await expect(decryptToken("v1:Zm9=:ddBb")).rejects.toThrow(
      new Error("ENCRYPTION_KEY is not set in Convex env"),
    );
  });

  it("fails with OperationError on a tampered tag", async () => {
    const tampered = `${STORED.slice(0, -4)}Rxw=`;
    await expect(decryptToken(tampered)).rejects.toMatchObject({
      name: "OperationError",
    });
  });
});

describe("base64 helpers", () => {
  it("encodes standard padded base64", () => {
    expect(encodeBase64Bytes(new Uint8Array())).toBe("");
    expect(encodeBase64Bytes(new Uint8Array([0xff]))).toBe("/w==");
    expect(encodeBase64Bytes(new Uint8Array([0xfb, 0xff, 0xbf]))).toBe("+/+/");
    expect(encodeBase64Bytes(new TextEncoder().encode("foob"))).toBe(
      "Zm9vYg==",
    );
  });

  it("decodes canonical base64 into an ArrayBuffer-backed copy", () => {
    const bytes = decodeBase64Bytes("Zm9vYg==");
    expect(hex(bytes)).toBe("666f6f62");
    expect(bytes.buffer).toBeInstanceOf(ArrayBuffer);
    expect(bytes.byteOffset).toBe(0);
    expect(bytes.buffer.byteLength).toBe(4);
  });

  it.each([
    ["abc", "padding: invalid, string should have whole number of bytes"],
    ["Zm9v\n", "padding: invalid, string should have whole number of bytes"],
    [" Zm9v", "padding: invalid, string should have whole number of bytes"],
    ["Zm9=", "Non-zero padding: 64"],
    ["Zh==", "Non-zero padding: 16"],
    [
      "Zg==Zg==",
      'Unknown letter: "=". Allowed: ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
    ],
  ])("rejects %j with the @scure/base message", (value, message) => {
    expect(() => decodeBase64Bytes(value)).toThrow(new Error(message));
  });

  it("copies a byte view into its own ArrayBuffer", () => {
    const source = new Uint8Array([9, 1, 2, 3, 9]);
    const buffer = toArrayBuffer(source.subarray(1, 4));
    expect(hex(new Uint8Array(buffer))).toBe("010203");
  });
});
