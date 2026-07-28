import { z } from "zod";
import type { Id } from "@vmem/backend";

const convexStorageUploadSchema = z.object({
  storageId: z.string().min(1),
});

function isStorageId(value: string): value is Id<"_storage"> {
  return value.length > 0;
}

// parse `{ storageId }` from Convex's signed file upload POST response
export function parseConvexStorageUpload(json: unknown): Id<"_storage"> | null {
  const parsed = convexStorageUploadSchema.safeParse(json);
  if (!parsed.success || !isStorageId(parsed.data.storageId)) return null;
  return parsed.data.storageId;
}

export const memorySchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  tags: z.array(z.string()),
});

export const apiKeySchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(50, "Name must be 50 characters or less"),
});

export type MemoryFormValues = z.infer<typeof memorySchema>;
export type ApiKeyFormValues = z.infer<typeof apiKeySchema>;
