import { UpdateChecker } from "@vvedantb/native-ui/primitives";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

/** `app.config.ts`'s `DEFAULT_VERSION_NAME`: a local build, which has no release to compare with. */
const UNRELEASED_VERSION = "0.1.0";
/** The APK releases: tags `mobile-apk-<versionName>` (`RELEASE.md`). */
const RELEASES = { repo: "vvedantb/vmem", tagPrefix: "mobile-apk-" };
/** Where Later keeps the version it hid. */
const DISMISSED = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
};

/**
 * "Update available" once at start when a newer APK is out. The APK is
 * sideloaded, with no over-the-air updates. "Install from V Store" only opens
 * V Store, and says so when V Store is not installed. Download opens the APK
 * in the browser. Later (and Android back) hides this version until a newer
 * one is out. Offline, rate limited or a local build: nothing is offered.
 */
export function UpdateDialog() {
  const version = Constants.expoConfig?.version;
  return (
    <UpdateChecker
      appName="vmem"
      currentVersion={version === UNRELEASED_VERSION ? null : version}
      source={RELEASES}
      storage={DISMISSED}
      storageKey="vmem.updateDismissed"
    />
  );
}
