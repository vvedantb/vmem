// Expo config plugin: signs `assembleRelease` with the vmem sideload key.
//
// Each value comes from the environment, else from keystore.properties in
// the repository root (gitignored):
//   ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS,
//   ANDROID_KEY_PASSWORD
// A release task stops when one is missing, so a release never falls back to
// the debug key. Debug builds (`expo run:android`) need none of them.
// scripts/build-android-release.sh checks for the marker line below.
const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// Added by apps/mobile/plugins/withReleaseSigning.js";

const RELEASE_SIGNING = `
${MARKER}
def vmemSigningProps = new Properties()
def vmemSigningFile = rootProject.file("../../../keystore.properties")
if (vmemSigningFile.exists()) {
    vmemSigningFile.withInputStream { vmemSigningProps.load(it) }
}
def vmemSigning = [
    "ANDROID_KEYSTORE_PATH",
    "ANDROID_KEYSTORE_PASSWORD",
    "ANDROID_KEY_ALIAS",
    "ANDROID_KEY_PASSWORD",
].collectEntries { name -> [(name): System.getenv(name) ?: vmemSigningProps.getProperty(name)] }
def vmemSigningMissing = vmemSigning.findAll { !it.value }.keySet()

android {
    signingConfigs {
        release {
            if (vmemSigningMissing.isEmpty()) {
                storeFile file(vmemSigning.ANDROID_KEYSTORE_PATH)
                storePassword vmemSigning.ANDROID_KEYSTORE_PASSWORD
                keyAlias vmemSigning.ANDROID_KEY_ALIAS
                keyPassword vmemSigning.ANDROID_KEY_PASSWORD
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}

gradle.taskGraph.whenReady { graph ->
    def release = graph.allTasks.any { it.project == project && it.name.toLowerCase().contains("release") }
    if (release && !vmemSigningMissing.isEmpty()) {
        throw new GradleException("Release signing needs ${vmemSigningMissing.join(", ")} in the environment or keystore.properties in the repository root.")
    }
}
`;

/** @param {import("expo/config").ExpoConfig} config */
module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes(MARKER)) {
      mod.modResults.contents += RELEASE_SIGNING;
    }
    return mod;
  });
};
