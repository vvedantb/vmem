import type { z } from "zod";

/**
 * Posts a capture to a server endpoint that answers with model output
 * (calendar summary, notification digest) and parses the reply. Throws an
 * `Error` with a message for the user.
 */
export async function postForModel<T>(options: {
  baseUrl: string;
  token: string;
  path: string;
  body: object;
  schema: z.ZodType<T>;
  /** Start of the failure message, for example "Calendar summary". */
  label: string;
  /** Message for a 422: the server has no model key. */
  unavailable: string;
  fetchImpl?: typeof fetch;
}): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${options.baseUrl}${options.path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(options.body),
  });
  if (response.status === 422) throw new Error(options.unavailable);
  if (!response.ok) {
    throw new Error(
      `${options.label} failed (HTTP ${String(response.status)})`,
    );
  }
  return options.schema.parse(await response.json());
}

/** Minutes the phone is ahead of UTC at `ms`. */
export function utcOffsetMinutes(ms: number): number {
  return -new Date(ms).getTimezoneOffset();
}
