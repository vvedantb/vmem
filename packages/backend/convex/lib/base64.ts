import { base64 } from "@scure/base";
import { bytesToBase64 } from "@vvedantb/server";

// Stays on @scure/base: files_upload returns its error messages to MCP clients.
export function decodeBase64Bytes(value: string): Uint8Array<ArrayBuffer> {
  const decoded = base64.decode(value);
  const bytes = new Uint8Array(decoded.length);
  bytes.set(decoded);
  return bytes;
}

export function encodeBase64Bytes(bytes: Uint8Array): string {
  return bytesToBase64(bytes);
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  if (buffer instanceof ArrayBuffer) return buffer;
  return new Uint8Array(buffer).slice().buffer;
}
