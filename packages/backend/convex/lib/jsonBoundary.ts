import { type ZodType, z } from "zod";

/** Parse a fetch Response body with zod. Throws on mismatch. */
export async function parseResponseJson<T>(
  response: Response,
  schema: ZodType<T, z.ZodTypeDef, unknown>,
): Promise<T> {
  const raw: unknown = await response.json();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`JSON response validation failed: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** OAuth access-token payload shared by provider token endpoints. */
export const oauthAccessTokenSchema = z.object({
  access_token: z.string().optional(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
  token_type: z.string().optional(),
  scope: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});
