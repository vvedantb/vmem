import type { FunctionReturnType } from "convex/server";
import type { api } from "@vmem/backend";

export type ApiKey = FunctionReturnType<typeof api.apiKeys.listMy>[number];
