import { createVProModule } from "@vvedantb/server";
import type { DataModel } from "./_generated/dataModel";

export const vPro = createVProModule<DataModel>()({
  table: "users",
  index: "by_clerk_id",
  clerkIdField: "clerkId",
  planSlugsField: "planSlugs",
});
