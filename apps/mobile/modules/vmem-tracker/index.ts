import { requireNativeModule } from "expo";
import { createTrackerApi, type VmemTrackerNative } from "./src/api";

export * from "./src/api";

/** The Android tracker (local Expo module, Kotlin in ./android). */
export const tracker = createTrackerApi(
  requireNativeModule<VmemTrackerNative>("VmemTracker"),
);
