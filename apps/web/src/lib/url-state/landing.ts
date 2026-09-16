import { z } from "zod";

// Bare `?agent` parses as "". `?agent=true` is boolean after JSON search parse.
const agentSearchFlagSchema = z
  .union([z.boolean(), z.literal("")])
  .optional()
  .transform((value) => (value === "" || value === true ? true : undefined));

export const landingSearchSchema = z.object({
  agent: agentSearchFlagSchema,
});
