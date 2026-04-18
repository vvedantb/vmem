import { streamText } from "ai";
import {
  buildFullEnrichmentPrompt,
  parseFullEnrichmentResponse,
  type EnrichmentCandidate,
  type ParsedFullEnrichment,
} from "@vmem/backend/enrichmentPrompt";
import type { LocalLanguageModel } from "@/lib/local-engine";
import { parseThinkTags } from "@/lib/think-tags";

export async function runLocalFullEnrichment(
  model: LocalLanguageModel,
  title: string,
  content: string,
  existingMemories: EnrichmentCandidate[],
): Promise<ParsedFullEnrichment | null> {
  const prompt = buildFullEnrichmentPrompt(title, content, existingMemories);
  const result = streamText({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
  });

  let rawAccumulated = "";
  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      rawAccumulated += part.text;
    } else if (part.type === "reasoning-delta") {
      rawAccumulated += part.text;
    }
  }

  const stripped = parseThinkTags(rawAccumulated);
  const jsonSource =
    stripped.text.trim().length > 0 ? stripped.text : rawAccumulated;
  return parseFullEnrichmentResponse(jsonSource);
}
