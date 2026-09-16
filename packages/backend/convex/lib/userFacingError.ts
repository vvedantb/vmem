import { ConvexError } from "convex/values";

/** Client-visible mutation/query failure. Plain `Error` is redacted in prod. */
export function userFacingError(message: string): never {
  throw new ConvexError(message);
}
