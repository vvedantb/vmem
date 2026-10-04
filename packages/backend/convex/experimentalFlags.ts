import type { Doc } from "./_generated/dataModel";
import type { Infer } from "convex/values";
import {
  experimentalFlagKeyValidator,
  resolvedExperimentalFlagsValidator,
} from "./validators";

export type ExperimentalFlagKey = Infer<typeof experimentalFlagKeyValidator>;
export type ResolvedExperimentalFlags = Infer<
  typeof resolvedExperimentalFlagsValidator
>;

/** Resolves experimental flags. Missing / unset keys are false. */
export function resolveExperimentalFlags(
  settings: Doc<"userSettings"> | null | undefined,
): ResolvedExperimentalFlags {
  const flags = settings?.experimentalFlags;
  return {
    disablePageMotion: flags?.disablePageMotion ?? false,
  };
}
