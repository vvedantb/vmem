import { v } from "convex/values";
import { ActionCache } from "@convex-dev/action-cache";
import { authAction } from "./auth";
import { components, internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { parseResponseJson } from "./lib/jsonBoundary";
import { z } from "zod";

const freeChatModelValidator = v.object({
  id: v.string(),
  name: v.string(),
  contextLength: v.number(),
  description: v.optional(v.string()),
});

export type FreeChatModel = {
  id: string;
  name: string;
  contextLength: number;
  description?: string;
};

/** Hardcoded fallback when OpenRouter catalog fetch fails. */
const FALLBACK_FREE_CHAT_MODELS: FreeChatModel[] = [
  {
    id: "google/gemma-3-27b-it:free",
    name: "Gemma 3 27B (free)",
    contextLength: 131072,
  },
  {
    id: "meta-llama/llama-4-maverick:free",
    name: "Llama 4 Maverick (free)",
    contextLength: 131072,
  },
  {
    id: "qwen/qwen3-235b-a22b-2507:free",
    name: "Qwen3 235B (free)",
    contextLength: 131072,
  },
  {
    id: "deepseek/deepseek-r1-distill-llama-70b:free",
    name: "DeepSeek R1 Distill Llama 70B (free)",
    contextLength: 8192,
  },
  {
    id: "mistralai/mistral-small-3.1-24b-instruct:free",
    name: "Mistral Small 3.1 24B (free)",
    contextLength: 96000,
  },
  {
    id: "microsoft/phi-4-reasoning:free",
    name: "Phi-4 Reasoning (free)",
    contextLength: 32768,
  },
  {
    id: "qwen/qwen3-4b:free",
    name: "Qwen3 4B (free)",
    contextLength: 40960,
  },
  {
    id: "nvidia/nemotron-nano-9b-v2:free",
    name: "Nemotron Nano 9B v2 (free)",
    contextLength: 131072,
  },
];

interface OpenRouterCatalogModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  expiration_date?: string | null;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  supported_parameters?: string[];
  output_modalities?: string[];
}

const catalogModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  context_length: z.number().optional(),
  expiration_date: z.string().nullable().optional(),
  pricing: z
    .object({
      prompt: z.string().optional(),
      completion: z.string().optional(),
    })
    .optional(),
  supported_parameters: z.array(z.string()).optional(),
  output_modalities: z.array(z.string()).optional(),
});

const catalogResponseSchema = z.object({
  data: z.array(catalogModelSchema).optional(),
});

function isFreePricing(pricing: OpenRouterCatalogModel["pricing"]): boolean {
  return pricing?.prompt === "0" && pricing?.completion === "0";
}

function supportsTools(model: OpenRouterCatalogModel): boolean {
  return model.supported_parameters?.includes("tools") ?? false;
}

function supportsTextOutput(model: OpenRouterCatalogModel): boolean {
  if (!model.output_modalities || model.output_modalities.length === 0) {
    return true;
  }
  return model.output_modalities.includes("text");
}

function isNotExpired(model: OpenRouterCatalogModel): boolean {
  if (!model.expiration_date) return true;
  const expiresAt = Date.parse(model.expiration_date);
  if (Number.isNaN(expiresAt)) return true;
  return expiresAt > Date.now();
}

function filterFreeToolModels(
  models: OpenRouterCatalogModel[],
): FreeChatModel[] {
  return models
    .filter(
      (model) =>
        isFreePricing(model.pricing) &&
        supportsTools(model) &&
        supportsTextOutput(model) &&
        isNotExpired(model),
    )
    .map((model) => ({
      id: model.id,
      name: model.name,
      contextLength: model.context_length ?? 8192,
      description: model.description,
    }))
    .sort((a, b) => b.contextLength - a.contextLength);
}

export const fetchFreeChatModelsInternal = internalAction({
  args: {},
  returns: v.array(freeChatModelValidator),
  handler: async (): Promise<FreeChatModel[]> => {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/models");
      if (!response.ok) {
        console.error(
          "[openRouterModels] catalog fetch failed:",
          response.status,
        );
        return FALLBACK_FREE_CHAT_MODELS;
      }

      const body = await parseResponseJson(response, catalogResponseSchema);
      const models: OpenRouterCatalogModel[] = body.data ?? [];
      const filtered = filterFreeToolModels(models);
      return filtered.length > 0 ? filtered : FALLBACK_FREE_CHAT_MODELS;
    } catch (error) {
      console.error("[openRouterModels] catalog fetch error:", error);
      return FALLBACK_FREE_CHAT_MODELS;
    }
  },
});

const freeChatModelsCache = new ActionCache(components.actionCache, {
  action: internal.openRouterModels.fetchFreeChatModelsInternal,
  name: "listFreeChatModels-v1",
  ttl: 6 * 60 * 60 * 1000,
});

/** Lists free OpenRouter chat models that support tool calling. */
export const listFreeChatModels = authAction({
  args: {},
  returns: v.array(freeChatModelValidator),
  handler: async (ctx): Promise<FreeChatModel[]> => {
    return await freeChatModelsCache.fetch(ctx, {});
  },
});
