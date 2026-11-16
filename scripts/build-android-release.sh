#!/usr/bin/env bash
# Build a signed, sideloadable vmem Android release APK (arm64-v8a + x86_64,
# embedded JS), then write release.json next to it. No EAS.
#
# Thin wrapper over the shared vvedantb-android-release bin, driven by
# scripts/android-release.config.json. The build logic lives in @vvedantb/config.
#
#   VERSION_NAME=1.0.1 VERSION_CODE=1000 ./scripts/build-android-release.sh
#
# .github/workflows/release-android.yml chooses both values and installs the
# workspace first, so the bin exists. Signing reads ANDROID_KEYSTORE_PATH,
# ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS and ANDROID_KEY_PASSWORD from the
# environment, else from keystore.properties in the repo root (gitignored); see
# apps/mobile/plugins/withReleaseSigning.js. Linux or WSL2.
set -euo pipefail
exec pnpm exec vvedantb-android-release --config scripts/android-release.config.json
