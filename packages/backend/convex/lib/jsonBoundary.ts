import { type ZodType, z } from "zod";

// parse a fetch Response body with zod; returns null on parse or schema failure
export async function safeParseResponseJson<T>(
  response: Response,
  schema: ZodType<T, z.ZodTypeDef, unknown>,
): Promise<T | null> {
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    return null;
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// OAuth access-token payload shared by provider token endpoints
export const oauthAccessTokenSchema = z.object({
  access_token: z.string().optional(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
  token_type: z.string().optional(),
  scope: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});
