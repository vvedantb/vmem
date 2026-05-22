import { VMemoryError } from "./errors";
import type {
  AgentProposal,
  MemoryCandidate,
  MemoryWithTags,
  RetrieveResult,
  StoreInstructionResult,
  UpdateInstructionResult,
} from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown, key: string): string | null {
  if (!isObject(value)) {
    return null;
  }
  const field = Reflect.get(value, key);
  return typeof field === "string" ? field : null;
}

function readOptionalString(value: unknown, key: string): string | undefined {
  const field = readString(value, key);
  return field ?? undefined;
}

function readNumber(value: unknown, key: string): number | null {
  if (!isObject(value)) {
    return null;
  }
  const field = Reflect.get(value, key);
  return typeof field === "number" ? field : null;
}

function readStringArray(value: unknown, key: string): string[] | null {
  if (!isObject(value)) {
    return null;
  }
  const field = Reflect.get(value, key);
  if (!Array.isArray(field)) {
    return null;
  }
  const tags: string[] = [];
  for (const item of field) {
    if (typeof item !== "string") {
      return null;
    }
    tags.push(item);
  }
  return tags;
}

function parseMemoryWithTags(value: unknown): MemoryWithTags | null {
  const id = readString(value, "id");
  const userId = readString(value, "userId");
  const title = readString(value, "title");
  const content = readString(value, "content");
  const type = readString(value, "type");
  const source = readString(value, "source");
  const confidence = readNumber(value, "confidence");
  const status = readString(value, "status");
  const createdAt = readString(value, "createdAt");
  const updatedAt = readString(value, "updatedAt");
  const tags = readStringArray(value, "tags");

  if (
    !id ||
    !userId ||
    !title ||
    !content ||
    !type ||
    !source ||
    confidence === null ||
    !status ||
    !createdAt ||
    !updatedAt ||
    !tags
  ) {
    return null;
  }

  let expiresAt: string | null = null;
  if (isObject(value)) {
    const expiresField = Reflect.get(value, "expiresAt");
    if (expiresField === null) {
      expiresAt = null;
    } else if (typeof expiresField === "string") {
      expiresAt = expiresField;
    } else {
      return null;
    }
  }

  return {
    id,
    userId,
    title,
    content,
    type,
    source,
    confidence,
    status,
    createdAt,
    updatedAt,
    expiresAt,
    tags,
  };
}

function parseMemoryCandidate(value: unknown): MemoryCandidate | null {
  const base = parseMemoryWithTags(value);
  if (!base || !isObject(value)) {
    return null;
  }

  const traceValue = Reflect.get(value, "trace");
  if (!isObject(traceValue)) {
    return null;
  }

  const score = readNumber(traceValue, "score");
  const reason = readString(traceValue, "reason");
  const scoreBreakdownValue = Reflect.get(traceValue, "scoreBreakdown");
  if (!isObject(scoreBreakdownValue) || score === null || !reason) {
    return null;
  }

  const fulltext = readNumber(scoreBreakdownValue, "fulltext");
  const vector = readNumber(scoreBreakdownValue, "vector");
  const chunk = readNumber(scoreBreakdownValue, "chunk");
  const entity = readNumber(scoreBreakdownValue, "entity");
  const rrf = readNumber(scoreBreakdownValue, "rrf");
  const recency = readNumber(scoreBreakdownValue, "recency");
  const confidence = readNumber(scoreBreakdownValue, "confidence");

  if (
    fulltext === null ||
    vector === null ||
    chunk === null ||
    entity === null ||
    rrf === null ||
    recency === null ||
    confidence === null
  ) {
    return null;
  }

  return {
    ...base,
    trace: {
      score,
      reason,
      scoreBreakdown: {
        fulltext,
        vector,
        chunk,
        entity,
        rrf,
        recency,
        confidence,
      },
    },
  };
}

function parseAgentProposal(value: unknown): AgentProposal | null {
  const id = readString(value, "id");
  const memoryId = readString(value, "memoryId");
  const proposedContent = readString(value, "proposedContent");
  const reason = readString(value, "reason");
  const kind = readString(value, "kind");
  const status = readString(value, "status");

  if (!id || !memoryId || !proposedContent || !reason || !kind || !status) {
    return null;
  }

  return { id, memoryId, proposedContent, reason, kind, status };
}

function invalidResponse(): never {
  throw new VMemoryError(
    "VMemory API returned an unexpected response shape",
    0,
    "invalid_response",
  );
}

export function parseStoreInstructionResult(
  value: unknown,
): StoreInstructionResult {
  const summary = readString(value, "summary");
  if (!summary || !isObject(value)) {
    invalidResponse();
  }

  const createdField = Reflect.get(value, "created");
  if (!Array.isArray(createdField)) {
    invalidResponse();
  }

  const created: MemoryWithTags[] = [];
  for (const item of createdField) {
    const memory = parseMemoryWithTags(item);
    if (!memory) {
      invalidResponse();
    }
    created.push(memory);
  }

  return { created, summary };
}

export function parseUpdateInstructionResult(
  value: unknown,
): UpdateInstructionResult {
  const summary = readString(value, "summary");
  if (!summary || !isObject(value)) {
    invalidResponse();
  }

  const appliedField = Reflect.get(value, "applied");
  const proposalsField = Reflect.get(value, "proposals");
  if (!Array.isArray(appliedField) || !Array.isArray(proposalsField)) {
    invalidResponse();
  }

  const applied: MemoryWithTags[] = [];
  for (const item of appliedField) {
    const memory = parseMemoryWithTags(item);
    if (!memory) {
      invalidResponse();
    }
    applied.push(memory);
  }

  const proposals: AgentProposal[] = [];
  for (const item of proposalsField) {
    const proposal = parseAgentProposal(item);
    if (!proposal) {
      invalidResponse();
    }
    proposals.push(proposal);
  }

  return { applied, proposals, summary };
}

export function parseRetrieveResult(value: unknown): RetrieveResult {
  if (!isObject(value)) {
    invalidResponse();
  }

  const memoriesField = Reflect.get(value, "memories");
  const userContextField = Reflect.get(value, "userContext");
  if (!Array.isArray(memoriesField) || !isObject(userContextField)) {
    invalidResponse();
  }

  const memories: MemoryCandidate[] = [];
  for (const item of memoriesField) {
    const memory = parseMemoryCandidate(item);
    if (!memory) {
      invalidResponse();
    }
    memories.push(memory);
  }

  const aboutMeField = Reflect.get(userContextField, "aboutMe");
  const preferencesField = Reflect.get(userContextField, "preferences");

  let aboutMe: string | null = null;
  if (aboutMeField === null) {
    aboutMe = null;
  } else if (typeof aboutMeField === "string") {
    aboutMe = aboutMeField;
  } else {
    invalidResponse();
  }

  let preferences: string | null = null;
  if (preferencesField === null) {
    preferences = null;
  } else if (typeof preferencesField === "string") {
    preferences = preferencesField;
  } else {
    invalidResponse();
  }

  const summary = readOptionalString(value, "summary");

  return {
    memories,
    userContext: { aboutMe, preferences },
    ...(summary ? { summary } : {}),
  };
}

export function parseMemoryWithTagsResponse(value: unknown): MemoryWithTags {
  const memory = parseMemoryWithTags(value);
  if (!memory) {
    invalidResponse();
  }
  return memory;
}
