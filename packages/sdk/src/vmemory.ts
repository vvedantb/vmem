import { z } from "zod";
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

const nodeProcessSchema = z.object({
  env: z.record(z.unknown()),
});

const globalWithProcessSchema = z.object({
  process: nodeProcessSchema.optional(),
});

const nonEmptyStringSchema = z.string().min(1);

function readEnv(name: string): string | undefined {
  const parsed = globalWithProcessSchema.safeParse(globalThis);
  if (!parsed.success) {
    return undefined;
  }
  const value = parsed.data.process?.env[name];
  const valueParsed = nonEmptyStringSchema.safeParse(value);
  return valueParsed.success ? valueParsed.data : undefined;
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

type RetrieveBodyInput = {
  limit?: number;
  type?: string;
  tags?: string[];
  summarize?: boolean;
  profileId?: string;
};

function buildRetrieveBody(query: string, options: RetrieveBodyInput): object {
  return {
    query,
    limit: options.limit ?? 10,
    ...(options.profileId ? { profileId: options.profileId } : {}),
    ...(options.type ? { type: options.type } : {}),
    ...(options.tags ? { tags: options.tags } : {}),
    ...(options.summarize ? { summarize: true } : {}),
  };
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
    const data = await this.client.post(
      "/api/v1/memories/retrieve",
      buildRetrieveBody(query, {
        limit: options?.limit,
        type: options?.type,
        tags: options?.tags,
        summarize: options?.summarize,
        profileId: this.resolveProfileId(options),
      }),
    );
    return parseRetrieveResult(data);
  }

  async createMemory(
    input: StructuredCreateMemoryInput,
  ): Promise<MemoryWithTags> {
    const data = await this.client.post("/api/v1/memories", input);
    return parseMemoryWithTagsResponse(data);
  }

  async patchMemory(
    input: StructuredPatchMemoryInput,
  ): Promise<MemoryWithTags> {
    const data = await this.client.patch("/api/v1/memories", input);
    return parseMemoryWithTagsResponse(data);
  }

  async searchMemories(
    input: StructuredRetrieveInput,
  ): Promise<RetrieveResult> {
    const data = await this.client.post(
      "/api/v1/memories/retrieve",
      buildRetrieveBody(input.query, input),
    );
    return parseRetrieveResult(data);
  }
}

export { VMemoryError, isVMemoryError } from "./errors";
