/**
 * LoCoMo session → atomic facts extraction prompt for the vmem provider.
 *
 * Derived from the production single-user prompt
 * (`convex/prompts/v2Prompt.ts` `buildFactExtractionPrompt`) but adapted for
 * the benchmark's two-speaker setting:
 *   - Facts are THIRD-PERSON and attributed by speaker name (production
 *     facts are first-person "I…", which collapses two people into one).
 *   - The session date is baked INTO the fact text, because the engine's
 *     `createMemory` hardcodes `createdAt = now` — so the only place a
 *     LoCoMo temporal signal can live is the content itself.
 *
 * Output schema is identical to production (`{ "facts": [{ "id", "text" }] }`)
 * so the response is parsed with the production `parseFactExtractionResponse`.
 */

export function buildBenchExtractionPrompt(
  sessionTranscript: string,
  sessionDate: string,
  speakerA: string,
  speakerB: string,
): string {
  return `You extract durable, atomic facts from one session of a long conversation between two people: ${speakerA} and ${speakerB}. Respond with ONLY a JSON object — no explanation, no thinking, no markdown.

# Task

Read the session and extract every atomic fact worth remembering about either speaker (preferences, life events, relationships, plans, decisions, opinions). Each fact:
- Is a SINGLE statement (no conjunctions, no compound sentences).
- Is THIRD-PERSON and names the speaker it is about (e.g. "${speakerA} adopted a dog named Max").
- Is durable — still true later (skip pure small-talk and momentary mood).
- Bakes in the date when the fact is time-bound. The session happened on: ${sessionDate || "an unknown date"}. For dated events write the date into the fact (e.g. "${speakerB} started a new job on 8 May 2023").

If the session contains no durable facts, return { "facts": [] }.

# Rules

- Preserve specifics: names, places, numbers, dates. Never generalize them away.
- No fabrication: every fact must trace to something a speaker actually said.
- Attribute correctly: do not assign one speaker's fact to the other.
- Split compound statements into separate facts.
- Image captions (if present) describe a shared photo — attribute the fact to whoever introduced the image.

# Output schema

{ "facts": [ { "id": 0, "text": "${speakerA} moved to Berlin in March 2023" } ] }

If none: { "facts": [] }

# Session
${sessionTranscript}

# Your output (JSON only)`;
}

/** Render a session's turns into a compact transcript for the extractor. */
export function renderSessionTranscript(
  turns: Array<{ speaker: string; text: string; blipCaption?: string }>,
): string {
  return turns
    .map((turn) => {
      const caption = turn.blipCaption
        ? ` [shared an image: ${turn.blipCaption}]`
        : "";
      return `${turn.speaker}: ${turn.text}${caption}`;
    })
    .join("\n");
}
