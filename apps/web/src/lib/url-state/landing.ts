import { z } from "zod";

export const landingSearchSchema = z.object({
  agent: z.boolean().optional(),
});
