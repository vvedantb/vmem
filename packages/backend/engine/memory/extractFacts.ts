import { z } from "zod";
import { parseJsonString } from "../llm/extractJsonString";

export interface ExtractedFact {
  id: number;
  text: string;
}

export interface ExtractedFactsResponse {
  facts: ExtractedFact[];
}

export function buildFactExtractionPrompt(
  capturedPrompt: string,
  observationDate: string,
  currentDate: string,
): string {
  return `You are a personal-memory fact extractor. Given a single message the user sent to an AI assistant, extract every atomic, durable fact ABOUT THE USER that is worth remembering. Respond with ONLY a JSON object — no explanation, no thinking, no markdown.

# Task

Decompose the user's message into atomic facts. Each fact:
- Is a SINGLE statement (no compound sentences, no conjunctions).
- Is about the USER (their preferences, projects, beliefs, life facts, decisions).
- Is durable — would still be true a week from now (skip ephemeral mood, momentary requests, "today" without context).
- Is first-person, present tense.

If the message contains no durable facts about the user (e.g. "what's the weather?" or "explain monads"), return { "facts": [] }.

# Core Rules

## Preserve Specific Details

Never generalize. If the user says "I'm using TypeScript 5.4 with Bun", facts must include:
- "I am using TypeScript 5.4"
- "I am using Bun"

## No Fabrication

Every fact must be grounded in the user's literal words. Do not infer affiliation, expertise, or demographics.

## Atomic Decomposition

Compound statements MUST be split:
- "I love Python and I prefer Vim" → 2 facts: "I love Python" / "I prefer Vim"

# Context

Observation date: ${observationDate}
Current date: ${currentDate}

# Output schema

{
  "facts": [
    { "id": 0, "text": "I prefer TypeScript over JavaScript" },
    { "id": 1, "text": "I am building a memory app called vmem" }
  ]
}

If no durable facts: { "facts": [] }

# User message

${capturedPrompt}

# Your output (JSON only)`;
}

const factItemSchema = z.object({
  id: z.number().optional().catch(undefined),
  text: z.string().trim().min(1),
});

const factExtractionResponseSchema = z.object({
  facts: z.array(z.unknown()),
});

export function parseFactExtractionResponse(
  raw: string,
): ExtractedFactsResponse | null {
  const parsed = parseJsonString(raw, factExtractionResponseSchema);
  if (!parsed) return null;

  const facts: ExtractedFact[] = [];
  for (const item of parsed.facts) {
    const fact = factItemSchema.safeParse(item);
    if (!fact.success) continue;
    facts.push({ id: fact.data.id ?? facts.length, text: fact.data.text });
  }
  return { facts };
}
