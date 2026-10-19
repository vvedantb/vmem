# @vmem/desktop

Desktop activity recorder for vmem. It tracks the active app and window title, groups the activity into summaries and saves them to vmem as episodic memories.

Stack: Electron, React and `@vvedantb/ui` for the settings window (built with Vite), `get-windows` for the active window, `electron-builder` for packaging. Windows and macOS are the main targets. Linux works for development and CI.

## Run

```bash
pnpm install
pnpm --filter @vmem/desktop dev     # build, then start Electron
pnpm --filter @vmem/desktop start   # start the last build
```

`pnpm install` downloads the Electron binary (`onlyBuiltDependencies` in `pnpm-workspace.yaml`).

The app runs in the tray. On first start, signed out, it opens the settings window and records nothing until you sign in.

## Sign in

Press **Sign in with vmem** in the settings window. The app opens your system browser for Clerk sign-in (the same OAuth that the vmem MCP server uses):

1. The app starts a one-shot server on `127.0.0.1` at a random port, with the redirect `http://127.0.0.1:<port>/callback`.
2. It finds the OAuth metadata of `https://clear-bear-690.eu-west-1.convex.site/mcp` (the resource), registers a public client named `vmem` and opens the authorisation URL. The flow is authorization code with PKCE (`@modelcontextprotocol/sdk`).
3. The app checks the `state`, exchanges the code and saves the tokens. The window shows your name and email (from the `id_token`, or the `userinfo` endpoint).
4. Before each flush the app refreshes an expiring access token. It posts summaries with `Authorization: Bearer <access token>` through `@vmem/sdk`.

**Sign out** revokes the tokens at the authorisation server (best effort), clears them and removes any saved API key.

Signed out counts as paused: no windows, clipboard or screenshots are recorded, even when Pause is off, and nothing is posted. The tray tooltip reads `vmem (sign in needed)`.

Token storage: the OAuth client information and tokens are encrypted with Electron `safeStorage` and saved as base64 ciphertext in `settings.json`. If encryption is not available (for example Linux without a keyring), tokens stay in memory for the session and you sign in again after a restart. Plain tokens never reach the disk.

Existing installs: a saved `apiKey` keeps working until you sign in with Clerk. Sign-in then removes it. `VMEM_API_KEY` still overrides everything (used by tests).

> **Deploy note.** The HTTP ingest route (`/api/v1/memories`) accepts a Clerk access token only after the backend change in `packages/backend/convex/http/v1Memories/apiKeyAuth.ts` is deployed to Convex prod (`clear-bear-690`). Until that deploy, Clerk sign-in works but posts return 401. API keys work either way.

## Settings

Open the settings window from the tray menu. Changes save when you switch a toggle, leave a field or press Enter, and a toast confirms each save. Settings live in `settings.json` in the Electron `userData` folder (file mode `0600`). The folder is named `vmem Desktop` (for example `~/.config/vmem Desktop` on Linux). The app name is `vmem`, but `main.ts` keeps the old folder path so existing settings, events and sign-in survive. Older builds used `vmem-desktop`; move the files if you need the old settings.

| Setting          | Default    | Notes                                                                                                                                                |
| ---------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account          | signed out | Sign in with vmem (Clerk). No API key or base URL fields.                                                                                            |
| Pause            | off        | Also in the tray. Pause records nothing.                                                                                                             |
| Idle threshold   | 5 min      | No keyboard or mouse input for this long ends the session. Idle time is not counted.                                                                 |
| Summary interval | 15 min     | Also flushes on quit.                                                                                                                                |
| Clipboard text   | off        | Copied text is trimmed, redacted and added to a capture memory.                                                                                      |
| Screenshots      | off        | Every 10 min. Saved in `userData/screenshots`. Never uploaded.                                                                                       |
| Blocklist        | empty      | One app name or title fragment per line, case-insensitive. Added to the defaults. Password managers and private browsing windows are always blocked. |
| Launch at login  | off        | Applies to packaged builds only.                                                                                                                     |

The host is `https://clear-bear-690.eu-west-1.convex.site`. Only the environment variable `VMEM_BASE_URL` changes it (tests and dev). `VMEM_API_KEY` overrides the credential. Old `settings.json` files with `apiKey` and `baseUrl` still load; the app ignores `baseUrl` and drops it on the next save.

The window uses `@vvedantb/ui` with Tailwind v4 and the shared tokens, follows the system light or dark theme and ships Instrument Sans locally (`renderer/fonts`).

## Privacy

- **No keystroke logging.** Idle detection reads only the time since the last input.
- Paused means nothing is recorded: no windows, clipboard or screenshots.
- Always blocked: 1Password, Bitwarden, LastPass, KeePass, Dashlane, NordPass, Proton Pass, RoboForm, and windows whose title contains Incognito, InPrivate, Private Browsing or Private Window. Matching also applies to titles, so a browser tab showing a vault is blocked. Blocked windows are recorded only as a gap, with no app or title.
- Window titles and clipboard text pass through a redaction step (`password=...`, long hex or token-like strings, `vmem_sk_...`). Redaction is best effort. Add your own blocklist entries for sensitive apps.
- Screenshots stay on the device. A memory only states that screenshots were taken.
- On macOS, grant Accessibility and Screen Recording access to read window titles. Without it, titles may be empty. The app does not prompt for them.

## How summaries work

The tracker records an event only when the focus changes, the user goes idle or the app pauses. Events go to `events.json` in `userData`. Each flush:

1. Merges consecutive samples of the same app and title.
2. Ends sessions at idle, paused and blocked gaps.
3. Drops sessions under 30 s, unless nothing longer exists.
4. Writes one memory per app, for example `Worked in Code on search.ts - vmem for 45 min`, plus one capture memory when clipboard or screenshots were used.
5. Posts each memory with `VMemory.createMemory()` using `source: "desktop"`, `sourceType: "desktop"`, `type: "episodic"` and the tag `desktop`.

If a post fails, the events stay and the next flush retries. A crash can drop up to one interval of activity. The backend ranks desktop memories at 85% of the score of equal memories from other sources.

## Smoke test and packaged test

```bash
pnpm --filter @vmem/desktop smoke                 # dev build
VMEM_DESKTOP_SMOKE=1 release/linux-unpacked/vmem-desktop --no-sandbox   # packaged
```

Smoke starts the tray, imports `get-windows`, calls `activeWindow` once and ticks the tracker once. A headless display may return no window, which passes. If the import, the call or the tick throws, the app logs the error, exits non-zero and does not print `VMEM_DESKTOP_SMOKE_OK`. On success it prints exactly `VMEM_DESKTOP_SMOKE_OK` and exits 0. It does not write events or post. On Linux CI, run under `xvfb-run -a`. `--no-sandbox` is needed when `chrome-sandbox` is not set up.

The packaged test proves that tracking works end to end:

```bash
pnpm --filter @vmem/desktop package:linux
pnpm --filter @vmem/desktop test:packaged   # needs xvfb, openbox, xterm, x11-utils
```

`scripts/packaged-test.mjs` starts `openbox`, an `xterm` with a known title and a mock vmem API. It runs the packaged binary with `VMEM_DESKTOP_PACKAGED_TEST=1`, `--user-data-dir` set to a temp folder and `VMEM_API_KEY` and `VMEM_BASE_URL` set. The app ticks the tracker, writes `events.json`, posts the summarised memories and exits 0 only if it recorded a focus event. The script then checks that the mock got `POST /api/v1/memories` with `source: "desktop"` and `sourceType: "desktop"` that names the xterm window. A run with only `gap` events fails.

`pnpm --filter @vmem/desktop check:asar` runs `vvedantb-check-asar resolve` (from `@vvedantb/config`). It runs the packaged binary with `ELECTRON_RUN_AS_NODE=1`, opens `app.asar` and resolves every unbundled import. Then `scripts/check-asar-hook.mjs` checks the unpacked native files and imports and calls the bundled `get-windows` path (`dist/active-window.js`). Use it after packaging. Pass a binary and asar path to check a Windows or macOS build.

## Tests and packaging

```bash
pnpm --filter @vmem/desktop test
pnpm --filter @vmem/desktop typecheck
pnpm --filter @vmem/desktop package:linux   # release/linux-unpacked
pnpm --filter @vmem/desktop package:win     # NSIS installer (run on Windows)
pnpm --filter @vmem/desktop package:mac     # x64 and arm64 dmg (run on macOS)
```

The scripts also work from `apps/desktop` (for example `pnpm exec electron-builder --linux dir`).

### Packaging model

The app ships no `node_modules`. `electron-builder` packs only `dist/**`, `assets/**` and `package.json`. `scripts/skip-node-modules.mjs` (the `beforeBuild` hook) stops it from collecting dependencies from the pnpm tree. That tree could not be resolved from the app folder, and nested packages such as `readable-stream@3` did not reach the asar.

`scripts/build.mjs` bundles the main process with esbuild, including `@vmem/sdk`, `@modelcontextprotocol/sdk`, `zod` and the `get-windows` JS. Only `electron` stays external. It builds the settings window into `dist/renderer` with Vite (`vite.config.ts`). Two `get-windows` files do not survive bundling, so the build swaps them for shims in `src/native`:

- `lib/windows.js` found its addon with `@mapbox/node-pre-gyp` and `__dirname`. The shim loads `dist/native/win32-<arch>/node-get-windows.node`. `node-pre-gyp` is not bundled.
- `lib/macos.js` ran `../main` next to the package. The shim runs `dist/native/main`.
- Linux uses `xprop` and `xwininfo`, so it needs no native file. Install `x11-utils` on the host.

The build copies the native files into `dist/native` and `asarUnpack` unpacks them to `app.asar.unpacked`. `src/native/dir.ts` maps the path. The build fails on Windows if no `node-get-windows.node` exists and on macOS if `get-windows/main` is missing, so run the native fetch first. `get-windows` stays in `dependencies` so that install downloads the natives.

CI sets this up: the Windows job runs `node-pre-gyp install --fallback-to-build` for the Electron version in `package.json` (x64) before packaging. The macOS job checks that the `main` binary holds both x86_64 and arm64, so the same copy serves both dmg files.

### Name, icons and updates

Users see **vmem**: `productName: vmem` (window title, installer, Start Menu, Applications, About, tray tooltip). These stay stable so existing installs and CI keep working:

- `appId: uk.projectv.vmem.desktop`, so a future updater still matches installed copies.
- `extraMetadata.name: vmem-desktop` and `linux.executableName: vmem-desktop`, so the Linux binary stays `release/linux-unpacked/vmem-desktop`.
- `artifactName: vmem-desktop-${version}-${os}-${arch}.${ext}`, so GitHub release asset names do not change.
- The `userData` folder stays `vmem Desktop`: `main.ts` calls `app.setName("vmem")`, then sets the path back (unless `--user-data-dir` is set).

There is no `electron-updater`, `publish` block or `latest*.yml` in this repo, so the rename changes no update feed. On Windows the unpacked app is now `release/win-unpacked/vmem.exe`, and the workflow checks that name.

Icons live in `assets/`: `icon.png` (Linux, BrowserWindow), `icon.icns` (macOS), `icon.ico` (Windows), `tray.png` and `tray@2x.png` (Windows and Linux tray) and `trayTemplate.png` and `trayTemplate@2x.png` (macOS menu bar template, monochrome). `pnpm --filter @vmem/desktop icons` regenerates them from `apps/web/public/icon.png` and the `VmemLogo` paths. The files are committed, so CI needs no `iconutil`.

Releases: push a tag `desktop-v*` or run the `Desktop` workflow manually. Windows and macOS build on native runners, then a `publish` job creates the GitHub Release. Installers are unsigned.
