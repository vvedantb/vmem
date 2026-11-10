import { describe, expect, it } from "vitest";
import {
  gatewayTranscribe,
  MAX_AUDIO_BYTES,
  TRANSCRIBE_MODEL,
  transcribeRequest,
} from "./transcribe";

function audioRequest(field: string, bytes: number): Request {
  const form = new FormData();
  form.append(field, new File([new Uint8Array(bytes)], "note.m4a"));
  return new Request("https://x.test/api/v1/mobile/transcribe", {
    method: "POST",
    body: form,
  });
}

describe("transcribeRequest", () => {
  it("sends the audio to the gateway and returns the text", async () => {
    const seen: { url: string; auth: string | null; model: unknown }[] = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const body = init?.body;
      seen.push({
        url:
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
        auth: new Headers(init?.headers).get("Authorization"),
        model: body instanceof FormData ? body.get("model") : null,
      });
      return Response.json({ text: "  buy milk  " });
    };
    const response = await transcribeRequest(
      audioRequest("audio", 10),
      gatewayTranscribe("gw-key", fakeFetch),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: "buy milk" });
    expect(seen).toEqual([
      {
        url: "https://ai-gateway.vercel.sh/v1/audio/transcriptions",
        auth: "Bearer gw-key",
        model: TRANSCRIBE_MODEL,
      },
    ]);
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
