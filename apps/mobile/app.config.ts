import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Android-only tracker. The package (`com.projectvdotuk.vmem`) follows the
 * other Project V apps. The scheme (`vmem`) is the archived vmem Expo app's
 * scheme, so Google sign-in reuses its `vmem://sso-callback` redirect.
 * See README.md.
 *
 * `scripts/build-android-release.sh` sets `VERSION_NAME` and `VERSION_CODE`.
 * `.github/workflows/release-android.yml` reads the `DEFAULT_VERSION_NAME`
 * line with sed as the versionName floor, so keep it a one-line literal.
 */
const DEFAULT_VERSION_NAME = "0.1.0";
const DEFAULT_VERSION_CODE = 1;

function versionCode(): number {
  const raw = process.env["VERSION_CODE"];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_VERSION_CODE;
}

export default (_context: ConfigContext): ExpoConfig => ({
  name: "vmem",
  slug: "vmem-mobile",
  version: process.env["VERSION_NAME"] || DEFAULT_VERSION_NAME,
  orientation: "portrait",
  scheme: "vmem",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  platforms: ["android"],
  android: {
    package: "com.projectvdotuk.vmem",
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
    "./plugins/withReleaseSigning.js",
  ],
  experiments: {
    typedRoutes: false,
    reactCompiler: true,
  },
});
