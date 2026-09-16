import { z } from "zod";

export const CLERK_PAGE_TOKEN_SOURCE = "vmem-clerk-token-sync";

const messageSchema = z.object({
  source: z.literal(CLERK_PAGE_TOKEN_SOURCE),
  jwt: z.string().min(20),
});

export function clerkPageTokenMessage(jwt: string): {
  source: typeof CLERK_PAGE_TOKEN_SOURCE;
  jwt: string;
} {
  return { source: CLERK_PAGE_TOKEN_SOURCE, jwt };
}

export function parseClerkPageTokenMessage(data: unknown): string | null {
  const parsed = messageSchema.safeParse(data);
  return parsed.success ? parsed.data.jwt : null;
}
