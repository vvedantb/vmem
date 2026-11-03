# Releasing the Android tracker

`.github/workflows/release-android.yml` builds and publishes the APK. V Store installs it from the GitHub Release. This repository does not change V Store.

## When it runs

| Event                                                                                                                      | Result                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Pull request that touches `apps/mobile/**`, `packages/sdk/src/**`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` or the workflow | Typecheck, tests and an unsigned release build. The APK is an artifact for 7 days. Nothing is published. |
| Push to `main` on the same paths (a merged pull request)                                                                   | Signed release build, published as a GitHub Release.                                                     |
| Manual run (`workflow_dispatch`)                                                                                           | The same as a push to `main`.                                                                            |

Put `[skip android release]` in the merge commit message to skip the release build on `main`.

## Versions

- `versionCode` is the highest published code plus 1. The workflow reads it from the GitHub Releases whose tag starts with `mobile-apk-`.
- `versionName` is `<major>.<minor>` from `apps/mobile/package.json` plus `.<versionCode>`. For example, version `0.1.0` and code 7 give `0.1.7`.
- The tag is `mobile-apk-<versionName>`, for example `mobile-apk-0.1.7`. Its last number is always the `versionCode`.
- The release assets are `vmem-android-<versionName>.apk` and its `.sha256` file. The release is not marked "latest", so the desktop and extension releases keep that flag.

To start a new minor line, change `version` in `apps/mobile/package.json` (for example to `0.2.0`). The code keeps counting up.

The workflow passes the values to `app.config.ts` as `VMEM_ANDROID_VERSION_CODE` and `VMEM_ANDROID_VERSION_NAME`. Local builds without them use code 1 and the `package.json` version.

## Required GitHub secrets

Set these under Settings, Secrets and variables, Actions. A push to `main` fails at "Check signing secrets" if one is missing. Pull request builds need none.

| Secret                      | Value                                                        |
| --------------------------- | ------------------------------------------------------------ |
| `ANDROID_KEYSTORE_BASE64`   | The upload keystore (`.jks` or `.keystore`), base64-encoded. |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore password.                                       |
| `ANDROID_KEY_ALIAS`         | The key alias in the keystore.                               |
| `ANDROID_KEY_PASSWORD`      | The key password.                                            |

Encode a keystore with `base64 -w0 release.keystore` (Linux) or `base64 -i release.keystore` (macOS). Do not commit keystores: `apps/mobile/.gitignore` ignores `*.jks` and `*.keystore`.

Every release must use the same key. Android refuses an update signed with another key, and the user must uninstall first. The package id is `com.vis1.vmem` (see README, Sign-in). A phone that still has the archived vmem app with that id and another signature must uninstall it first.

No other secret is needed. The sign-in publishable key and the API host are public and default to production in `src/config.ts`.

## How the build signs

The workflow runs `expo prebuild --platform android --clean`, then `./gradlew assembleRelease` with the Android Gradle Plugin signing override (`-Pandroid.injected.signing.*`), and the keystore decoded into the runner's temporary folder. It checks the result with `apksigner verify --print-certs`. It builds for `arm64-v8a` and `armeabi-v7a`.
