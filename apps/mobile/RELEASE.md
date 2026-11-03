# Releasing the Android tracker

`.github/workflows/release-android.yml` builds a signed APK with `scripts/build-android-release.sh` and publishes it as a GitHub Release. V Store installs it from that release. This repository does not change V Store. The APK is sideload only, not on Google Play.

## When it runs

| Event                                    | Result                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Push to `main` that changes an APK input | Signed build, published with the next patch version.                                                        |
| Manual run (`workflow_dispatch`)         | The same. Optional `version` input (like `1.0.1`). `dry_run: true` builds and signs, but publishes nothing. |

APK inputs (the `paths` filter) are only what goes into the APK: `apps/mobile/**` (not `tests/`, Markdown or `.env.example`), `packages/sdk/src/**` and `packages/sdk/package.json` (not tests), the root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc` and `scripts/build-android-release.sh`. The Convex backend, web, extension, desktop, docs and `.github/**` do not release. The app reaches vmem over HTTP with `@vmem/sdk` only, so Metro bundles no backend code. Keep the filter equal to that import closure.

The workflow has no pull request job. `pnpm typecheck:all` and `pnpm test` (and the pre-push hook) cover the mobile typecheck and tests.

The concurrency group `release-android` runs one release at a time and never cancels a run in progress. A queued run chooses its version after the run before it publishes.

## Versions

Every release has a `release.json` asset next to the APK:

```json
{ "versionName": "1.0.1", "versionCode": 1000, "sha256": "<APK SHA-256>" }
```

- `versionCode` is the highest `versionCode` in the published `mobile-apk-*` `release.json` files, plus 1. The floor is 1000. A legacy `mobile-apk-*` release without `release.json` counts as code 1.
- `versionName` is the `version` input. Without it, the workflow bumps the patch of the highest published semver `versionName`. `DEFAULT_VERSION_NAME` in `app.config.ts` is the floor: to start a new line, set it to, for example, `0.2.0`, and the next release is `0.2.1`.
- The tag is `mobile-apk-<versionName>`. The run stops if that release or tag already exists.
- The assets are `vmem-<versionName>-android.apk` and `release.json`. The title is `vmem <versionName>`. The notes come from `.github/android-release-notes.md`, plus the merged pull requests since the previous mobile release.
- The release is not marked "latest", so the desktop and extension releases keep that flag.

The script passes `VERSION_NAME` and `VERSION_CODE` to `app.config.ts`. Builds without them use `DEFAULT_VERSION_NAME` and `DEFAULT_VERSION_CODE` (1).

## Required GitHub secrets

Set these under Settings, Secrets and variables, Actions. The run stops at "Decode signing keystore" if one is missing. It never falls back to the debug key.

| Secret                      | Value                                                  |
| --------------------------- | ------------------------------------------------------ |
| `ANDROID_KEYSTORE_BASE64`   | The sideload keystore (PKCS12 or JKS), base64-encoded. |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore password.                                 |
| `ANDROID_KEY_ALIAS`         | The key alias in the keystore.                         |
| `ANDROID_KEY_PASSWORD`      | The key password.                                      |

Encode a keystore with `base64 -w0 release.p12` (Linux) or `base64 -i release.p12` (macOS). Do not commit keystores: `apps/mobile/.gitignore` ignores `*.jks`, `*.keystore` and `*.p12`.

Every release must use the same key. Android refuses an update signed with another key, and the user must uninstall first. The package id is `com.vis1.vmem` (see README, Sign-in). A phone that still has the archived vmem app with that id and another signature must uninstall it first.

No other secret is needed. The sign-in publishable key and the API host are public. The script bakes `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and `EXPO_PUBLIC_VMEM_BASE_URL` from the environment, else from the `process.env.NAME || "literal"` defaults in `src/config.ts`.

## How the build signs

`plugins/withReleaseSigning.js` is an Expo config plugin. At prebuild it adds a `release` signing config to `android/app/build.gradle`. It reads `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` from the environment, else from `keystore.properties` in the repository root (gitignored). A release task stops if one is missing. Debug builds need none.

The script runs `expo prebuild --platform android --clean`, then `./gradlew assembleRelease` for `arm64-v8a` and `x86_64`. Then it checks the APK: the package, `versionCode` and `versionName` (with `aapt2`), and a signature that is not the debug key (with `apksigner`). Only then does it write `release.json`.

## Build locally

```sh
cat > keystore.properties <<'EOF'
ANDROID_KEYSTORE_PATH=/absolute/path/to/release.p12
ANDROID_KEYSTORE_PASSWORD=...
ANDROID_KEY_ALIAS=...
ANDROID_KEY_PASSWORD=...
EOF
VERSION_NAME=0.1.1 VERSION_CODE=1000 ./scripts/build-android-release.sh
```

This needs Linux or WSL2, Java 21 and the Android SDK (`ANDROID_SDK_ROOT` or `ANDROID_HOME`). Set `SKIP_PREBUILD=1` to reuse `android/` when it was generated with the same `VERSION_CODE`.
