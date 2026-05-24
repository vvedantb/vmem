import type { FunctionReturnType } from "convex/server";
import { api } from "@vmem/backend";

export type TeamDetail = NonNullable<FunctionReturnType<typeof api.teams.get>>;
