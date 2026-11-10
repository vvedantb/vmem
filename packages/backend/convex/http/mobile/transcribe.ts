import { z } from "zod";
import { withBearerAuth } from "../v1Memories/apiKeyAuth";

// POST /api/v1/mobile/transcribe: voice notes from the Android app.
// Model: openai/gpt-4o-mini-transcribe through the AI Gateway transcription
// REST API (AI_GATEWAY_API_KEY). Audio is sent on, never stored.
export const TRANSCRIBE_MODEL = "openai/gpt-4o-mini-transcribe";
export const GATEWAY_TRANSCRIBE_URL =
  "https://ai-gateway.vercel.sh/v4/ai/transcription-model";
export const MAX_AUDIO_BYTES = 6 * 1024 * 1024;

const transcriptionResponseSchema = z.object({ text: z.string() });

export type Transcribe = (audio: File) => Promise<string>;

/** Base64 without Node Buffer (Convex default runtime has no Buffer). */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function mediaTypeFor(audio: File): string {
  return audio.type.trim().length > 0 ? audio.type : "audio/mp4";
}

export function gatewayTranscribe(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Transcribe {
  return async (audio) => {
    const bytes = new Uint8Array(await audio.arrayBuffer());
    const response = await fetchImpl(GATEWAY_TRANSCRIBE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "ai-gateway-protocol-version": "0.0.1",
        "ai-transcription-model-specification-version": "4",
        "ai-model-id": TRANSCRIBE_MODEL,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio: bytesToBase64(bytes),
        mediaType: mediaTypeFor(audio),
      }),
    });
    if (!response.ok) {
      throw new Error(
        `Gateway transcription failed: ${String(response.status)}`,
      );
    }
    const parsed = transcriptionResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error("Gateway transcription returned no text");
    }
    return parsed.data.text;
  };
}

/** The form's audio file, from the `file` or `audio` field. */
function audioField(form: FormData): File | null {
  for (const name of ["file", "audio"]) {
    const value = form.get(name);
    if (typeof value !== "string" && value !== null) return value;
  }
  return null;
}

/** Handler body, with the transcriber injected so tests need no network. */
export async function transcribeRequest(
  req: Request,
  transcribe: Transcribe | null,
): Promise<Response> {
  if (transcribe === null) {
    return Response.json(
      { error: "transcription_unavailable" },
      { status: 422 },
    );
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "invalid_form" }, { status: 400 });
  }
  const audio = audioField(form);
  if (audio === null || audio.size === 0) {
    return Response.json({ error: "audio_required" }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "audio_too_large" }, { status: 413 });
  }
  const text = (await transcribe(audio)).trim();
  return Response.json({ text }, { status: 200 });
}

export const transcribeHttp = withBearerAuth(
  "/api/v1/mobile/transcribe",
  "POST",
  (_ctx, _auth, req) => {
    const apiKey = process.env["AI_GATEWAY_API_KEY"]?.trim();
    return transcribeRequest(req, apiKey ? gatewayTranscribe(apiKey) : null);
  },
);
