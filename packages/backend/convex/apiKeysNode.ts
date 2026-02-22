"use node";

import crypto from "node:crypto";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const API_KEY_PREFIX = "vmem_sk_";
const API_KEY_RANDOM_BYTES = 24;

type CreateMyInternalResult = {
  id: Id<"apiKeys">;
  name: string;
  key: string;
  maskedKey: string;
};

type RecordUsageResult = {
  accepted: boolean;
  apiKeyId?: Id<"apiKeys">;
};

function getEnvOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable`);
  }
  return value;
}

function getEncryptionKey(): Buffer {
  const keyBase64 = getEnvOrThrow("API_KEY_ENCRYPTION_KEY_B64");
  let key: Buffer;

  try {
    key = Buffer.from(keyBase64, "base64");
  } catch {
    throw new Error("API_KEY_ENCRYPTION_KEY_B64 must be valid base64");
  }

  if (key.length !== 32) {
    throw new Error("API_KEY_ENCRYPTION_KEY_B64 must decode to 32 bytes");
  }

  return key;
}

function generateApiKey(): string {
  const randomPart = crypto
    .randomBytes(API_KEY_RANDOM_BYTES)
    .toString("base64url");
  return `${API_KEY_PREFIX}${randomPart}`;
}

function hashApiKey(rawKey: string): string {
  const pepper = getEnvOrThrow("API_KEY_HASH_PEPPER");
  return crypto.createHmac("sha256", pepper).update(rawKey).digest("hex");
}

function encryptApiKey(rawKey: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(rawKey, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `v1:${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

function maskApiKey(rawKey: string): string {
  const visiblePrefix = rawKey.slice(0, 12);
  const visibleSuffix = rawKey.slice(-4);
  return `${visiblePrefix}${"*".repeat(16)}${visibleSuffix}`;
}

function normalizeMethod(method: string): string {
  return method.trim().toUpperCase();
}

export const createMyInternal = internalAction({
  args: {
    userId: v.id("users"),
    name: v.string(),
  },
  handler: async (ctx, args): Promise<CreateMyInternalResult> => {
    const name = args.name.trim();
    if (!name) {
      throw new Error("Name is required");
    }
    if (name.length > 50) {
      throw new Error("Name must be 50 characters or less");
    }

    const key = generateApiKey();
    const keyHash = hashApiKey(key);
    const encryptedKey = encryptApiKey(key);
    const maskedKey = maskApiKey(key);

    const inserted: { id: Id<"apiKeys"> } = await ctx.runMutation(
      internal.apiKeys.insertKeyInternal,
      {
        userId: args.userId,
        name,
        maskedKey,
        keyHash,
        encryptedKey,
        createdAt: Date.now(),
      },
    );

    return {
      id: inserted.id,
      name,
      key,
      maskedKey,
    };
  },
});

export const recordUsageFromService = internalAction({
  args: {
    ingestSecret: v.string(),
    apiKey: v.string(),
    endpoint: v.string(),
    method: v.string(),
    status: v.number(),
    durationMs: v.number(),
  },
  handler: async (ctx, args): Promise<RecordUsageResult> => {
    const expectedSecret = getEnvOrThrow("API_KEY_INGEST_SECRET");
    if (args.ingestSecret !== expectedSecret) {
      throw new Error("Invalid ingest secret");
    }

    const apiKey = args.apiKey.trim();
    const endpoint = args.endpoint.trim();
    const method = normalizeMethod(args.method);

    const keyHash = hashApiKey(apiKey);
    return await ctx.runMutation(internal.apiKeys.recordUsageInternal, {
      keyHash,
      endpoint,
      method,
      status: args.status,
      durationMs: args.durationMs,
      createdAt: Date.now(),
    });
  },
});
