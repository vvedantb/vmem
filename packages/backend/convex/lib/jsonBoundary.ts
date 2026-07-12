import { type ZodType, z } from "zod";

/**
 * Read an own property as `unknown`.
 * Single escape hatch for Reflect.get's `any` return type.
 */
export function objectField(obj: object, key: string): unknown {
  // oxlint-disable-next-line typescript/no-unsafe-return -- Reflect.get is typed `any`
  return Reflect.get(obj, key);
}

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

/** Fetch a URL and parse the JSON body with zod. */
export async function fetchJson<T>(
  url: string,
  schema: ZodType<T, z.ZodTypeDef, unknown>,
  init?: RequestInit,
): Promise<T> {
  const responseUnknown: unknown = await fetch(url, init);
  if (!(responseUnknown instanceof Response)) {
    throw new Error("fetch did not return Response");
  }
  if (!responseUnknown.ok) {
    throw new Error(
      `HTTP ${String(responseUnknown.status)} ${responseUnknown.statusText}`,
    );
  }
  return parseResponseJson(responseUnknown, schema);
}

/** Coerce an unknown value into a typed `unknown[]` (avoids `Array.isArray` → `any[]`). */
export function parseUnknownArray(value: unknown): unknown[] {
  const parsed = z.array(z.unknown()).safeParse(value);
  return parsed.success ? parsed.data : [];
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

export type OAuthAccessToken = z.infer<typeof oauthAccessTokenSchema>;
