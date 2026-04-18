import { z } from "zod";

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
