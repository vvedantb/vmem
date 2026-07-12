import type { FunctionReturnType } from "convex/server";
import type { api } from "@vmem/backend";

export type TeamDetail = NonNullable<FunctionReturnType<typeof api.teams.get>>;
