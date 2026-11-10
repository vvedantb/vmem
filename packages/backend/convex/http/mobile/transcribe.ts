import { z } from "zod";
import { withBearerAuth } from "../v1Memories/apiKeyAuth";

// POST /api/v1/mobile/transcribe: voice notes from the Android app.
// Model: openai/gpt-4o-mini-transcribe through the AI Gateway (OpenAI-compatible
// audio API, AI_GATEWAY_API_KEY). Audio is sent on, never stored.
export const TRANSCRIBE_MODEL = "openai/gpt-4o-mini-transcribe";
const GATEWAY_TRANSCRIBE_URL =
  "https://ai-gateway.vercel.sh/v1/audio/transcriptions";
export const MAX_AUDIO_BYTES = 6 * 1024 * 1024;

const transcriptionResponseSchema = z.object({ text: z.string() });

export type Transcribe = (audio: File) => Promise<string>;

export function gatewayTranscribe(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Transcribe {
  return async (audio) => {
    const form = new FormData();
    form.append("file", audio, audio.name || "note.m4a");
    form.append("model", TRANSCRIBE_MODEL);
    const response = await fetchImpl(GATEWAY_TRANSCRIBE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
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
