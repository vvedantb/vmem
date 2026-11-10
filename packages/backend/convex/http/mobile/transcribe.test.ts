import { describe, expect, it } from "vitest";
import {
  GATEWAY_TRANSCRIBE_URL,
  gatewayTranscribe,
  MAX_AUDIO_BYTES,
  TRANSCRIBE_MODEL,
  transcribeRequest,
} from "./transcribe";

function audioRequest(
  field: string,
  bytes: number,
  type = "audio/mp4",
): Request {
  const form = new FormData();
  form.append(field, new File([new Uint8Array(bytes)], "note.m4a", { type }));
  return new Request("https://x.test/api/v1/mobile/transcribe", {
    method: "POST",
    body: form,
  });
}

describe("transcribeRequest", () => {
  it("posts base64 audio to the Gateway v4 transcription endpoint", async () => {
    const seen: {
      url: string;
      auth: string | null;
      modelId: string | null;
      protocol: string | null;
      spec: string | null;
      body: unknown;
    }[] = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      const raw = init?.body;
      seen.push({
        url:
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
        auth: headers.get("Authorization"),
        modelId: headers.get("ai-model-id"),
        protocol: headers.get("ai-gateway-protocol-version"),
        spec: headers.get("ai-transcription-model-specification-version"),
        body: typeof raw === "string" ? (JSON.parse(raw) as unknown) : null,
      });
      return Response.json({ text: "  buy milk  " });
    };
    const response = await transcribeRequest(
      audioRequest("audio", 3),
      gatewayTranscribe("gw-key", fakeFetch),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: "buy milk" });
    expect(seen).toEqual([
      {
        url: GATEWAY_TRANSCRIBE_URL,
        auth: "Bearer gw-key",
        modelId: TRANSCRIBE_MODEL,
        protocol: "0.0.1",
        spec: "4",
        body: { audio: "AAAA", mediaType: "audio/mp4" },
      },
    ]);
  });

  it("keeps the file media type and accepts extra gateway fields", async () => {
    let body: unknown = null;
    const fakeFetch: typeof fetch = async (_input, init) => {
      const raw = init?.body;
      body = typeof raw === "string" ? (JSON.parse(raw) as unknown) : null;
      return Response.json({
        text: "hello",
        language: "en",
        segments: [],
      });
    };
    const response = await transcribeRequest(
      audioRequest("file", 2, "audio/webm"),
      gatewayTranscribe("gw-key", fakeFetch),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: "hello" });
    expect(body).toEqual({ audio: "AAA=", mediaType: "audio/webm" });
  });

  it("rejects missing, empty and oversize audio, and a missing key", async () => {
    const never = () => Promise.reject(new Error("not called"));
    const empty = await transcribeRequest(audioRequest("file", 0), never);
    expect(empty.status).toBe(400);
    const big = await transcribeRequest(
      audioRequest("file", MAX_AUDIO_BYTES + 1),
      never,
    );
    expect(big.status).toBe(413);
    const unavailable = await transcribeRequest(audioRequest("file", 5), null);
    expect(unavailable.status).toBe(422);
  });
});
