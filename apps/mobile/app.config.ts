import type { ConfigContext, ExpoConfig } from "expo/config";
import pkg from "./package.json";

/**
 * Android-only tracker. The scheme (`vmem`) and package (`com.vis1.vmem`) are
 * the ones the archived vmem Expo app shipped with, so Google sign-in reuses
 * the `vmem://sso-callback` redirect that app already used. See README.md.
 *
 * The release workflow sets `VMEM_ANDROID_VERSION_CODE` (highest published
 * code + 1) and `VMEM_ANDROID_VERSION_NAME`.
 */
function versionCode(): number {
  const raw = process.env["VMEM_ANDROID_VERSION_CODE"];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export default (_context: ConfigContext): ExpoConfig => ({
  name: "vmem",
  slug: "vmem-mobile",
  version: process.env["VMEM_ANDROID_VERSION_NAME"] || pkg.version,
  orientation: "portrait",
  scheme: "vmem",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  platforms: ["android"],
  android: {
    package: "com.vis1.vmem",
    versionCode: versionCode(),
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#000000",
    },
  },
  // Sideloaded APKs update through V Store, not over the air.
  updates: { enabled: false },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-web-browser",
    "expo-secure-store",
  ],
  experiments: {
    typedRoutes: false,
    reactCompiler: true,
  },
});
