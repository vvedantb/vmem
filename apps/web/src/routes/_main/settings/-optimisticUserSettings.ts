import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs } from "convex/server";
import { api } from "@vmem/backend";

export type UserSettingsPatch = FunctionArgs<typeof api.userSettings.update>;

export function patchUserSettingsOptimistic(
  localStore: OptimisticLocalStore,
  args: UserSettingsPatch,
): void {
  const current = localStore.getQuery(api.userSettings.get, {});
  if (!current) return;
  localStore.setQuery(api.userSettings.get, {}, { ...current, ...args });
}
