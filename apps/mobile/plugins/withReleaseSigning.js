// Expo config plugin: signs `assembleRelease` with the vmem sideload key.
//
// Thin wrapper over @vvedantb/config `withReleaseSigning`. Each value comes
// from the environment, else from keystore.properties in the repository root
// (gitignored):
//   ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS,
//   ANDROID_KEY_PASSWORD
// A release task stops when one is missing, so a release never falls back to
// the debug key. Debug builds (`expo run:android`) need none of them.
// scripts/build-android-release.sh checks for the marker line below.
const vconfig = require("@vvedantb/config");
const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// Added by apps/mobile/plugins/withReleaseSigning.js";

/** @param {import("expo/config").ExpoConfig} config */
module.exports = function withReleaseSigning(config) {
  return vconfig.withReleaseSigning(config, {
    marker: MARKER,
    withAppBuildGradle,
  });
};
