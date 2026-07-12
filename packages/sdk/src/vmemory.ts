import { HttpClient } from "./http-client";
import { VMemoryError } from "./errors";
import {
  parseMemoryWithTagsResponse,
  parseRetrieveResult,
  parseStoreInstructionResult,
  parseUpdateInstructionResult,
} from "./validators";
import type {
  MemoryWithTags,
  RetrieveResult,
  StoreInstructionResult,
  StructuredCreateMemoryInput,
  StructuredPatchMemoryInput,
  StructuredRetrieveInput,
  UpdateInstructionResult,
  VMemoryOptions,
  VMemoryRequestOptions,
} from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readEnv(name: string): string | undefined {
  const globalProcess: unknown = globalThis.process;
  if (!isObject(globalProcess) || !("env" in globalProcess)) {
    return undefined;
  }
  const env = globalProcess.env;
  if (!isObject(env)) {
    return undefined;
  }
  const value = env[name];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return undefined;
}

function resolveRequiredOption(
  value: string | undefined,
  envName: string,
  label: string,
): string {
  const resolved = value ?? readEnv(envName);
  if (!resolved) {
    throw new VMemoryError(
      `Missing ${label}. Pass it to the VMemory constructor or set ${envName}.`,
      0,
      "missing_configuration",
    );
  }
  return resolved;
}

export class VMemory {
  private readonly client: HttpClient;
  private readonly defaultProfileId?: string;

  constructor(options: VMemoryOptions = {}) {
    const apiKey = resolveRequiredOption(
      options.apiKey,
      "VMEM_API_KEY",
      "apiKey",
    );
    const baseUrl = resolveRequiredOption(
      options.baseUrl,
      "VMEM_BASE_URL",
      "baseUrl",
    );
    this.client = new HttpClient(baseUrl, apiKey);
    this.defaultProfileId = options.profileId;
  }

  private resolveProfileId(
    options?: VMemoryRequestOptions,
  ): string | undefined {
    return options?.profileId ?? this.defaultProfileId;
  }

  async store(
    instruction: string,
    options?: VMemoryRequestOptions,
  ): Promise<StoreInstructionResult> {
    const profileId = this.resolveProfileId(options);
    const data = await this.client.post("/api/v1/memories", {
      instruction,
      ...(profileId ? { profileId } : {}),
    });
    return parseStoreInstructionResult(data);
  }

  async update(
    instruction: string,
    options?: VMemoryRequestOptions,
  ): Promise<UpdateInstructionResult> {
    const profileId = this.resolveProfileId(options);
    const data = await this.client.patch("/api/v1/memories", {
      instruction,
      ...(profileId ? { profileId } : {}),
    });
    return parseUpdateInstructionResult(data);
  }

  async retrieve(
    query: string,
    options?: VMemoryRequestOptions & {
      limit?: number;
      type?: string;
      tags?: string[];
      summarize?: boolean;
    },
  ): Promise<RetrieveResult> {
    const profileId = this.resolveProfileId(options);
    const data = await this.client.post("/api/v1/memories/retrieve", {
      query,
      limit: options?.limit ?? 10,
      ...(profileId ? { profileId } : {}),
      ...(options?.type ? { type: options.type } : {}),
      ...(options?.tags ? { tags: options.tags } : {}),
      ...(options?.summarize ? { summarize: true } : {}),
    });
    return parseRetrieveResult(data);
  }

  async createMemory(
    input: StructuredCreateMemoryInput,
  ): Promise<MemoryWithTags> {
    const data = await this.client.post("/api/v1/memories", { ...input });
    return parseMemoryWithTagsResponse(data);
  }

  async patchMemory(
    input: StructuredPatchMemoryInput,
  ): Promise<MemoryWithTags> {
    const data = await this.client.patch("/api/v1/memories", { ...input });
    return parseMemoryWithTagsResponse(data);
  }

  async searchMemories(
    input: StructuredRetrieveInput,
  ): Promise<RetrieveResult> {
    const data = await this.client.post("/api/v1/memories/retrieve", {
      query: input.query,
      limit: input.limit ?? 10,
      ...(input.profileId ? { profileId: input.profileId } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.tags ? { tags: input.tags } : {}),
      ...(input.summarize ? { summarize: true } : {}),
    });
    return parseRetrieveResult(data);
  }
}

export { VMemoryError, isVMemoryError } from "./errors";
export type {
  AgentProposal,
  MemoryCandidate,
  MemoryWithTags,
  RetrieveResult,
  StoreInstructionResult,
  StructuredCreateMemoryInput,
  StructuredPatchMemoryInput,
  StructuredRetrieveInput,
  UpdateInstructionResult,
  UserContext,
  VMemoryOptions,
  VMemoryRequestOptions,
} from "./types";
