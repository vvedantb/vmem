# @vmem/desktop

Desktop activity recorder for vmem. It tracks the active app and window title, groups the activity into summaries and saves them to vmem as episodic memories.

Stack: Electron, `get-windows` for the active window, `electron-builder` for packaging. Windows and macOS are the main targets. Linux works for development and CI.

## Run

```bash
pnpm install
pnpm --filter @vmem/desktop dev     # build, then start Electron
pnpm --filter @vmem/desktop start   # start the last build
```

`pnpm install` downloads the Electron binary (`onlyBuiltDependencies` in `pnpm-workspace.yaml`).

The app runs in the tray. On first start, with no API key, it opens the settings window.

## Settings

Open the settings window from the tray menu. Settings live in `settings.json` in the Electron `userData` folder (file mode `0600`, because it holds the API key).

| Setting          | Default                                        | Notes                                                                                |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| API key          | empty                                          | A `vmem_sk_...` key. Nothing posts without one.                                      |
| Base URL         | `https://clear-bear-690.eu-west-1.convex.site` |                                                                                      |
| Pause            | off                                            | Also in the tray. Pause records nothing.                                             |
| Idle threshold   | 5 min                                          | No keyboard or mouse input for this long ends the session. Idle time is not counted. |
| Summary interval | 15 min                                         | Also flushes on quit.                                                                |
| Clipboard text   | off                                            | Copied text is trimmed, redacted and added to a capture memory.                      |
| Screenshots      | off                                            | Every 10 min. Saved in `userData/screenshots`. Never uploaded.                       |
| Blocklist        | empty                                          | One app name or title fragment per line, case-insensitive. Added to the defaults.    |
| Launch at login  | off                                            | Applies to packaged builds only.                                                     |

`VMEM_API_KEY` and `VMEM_BASE_URL` override the saved values (useful for tests).

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

## Smoke test

```bash
VMEM_DESKTOP_SMOKE=1 electron . --no-sandbox
pnpm --filter @vmem/desktop smoke
```

The app starts the tray and tracker, prints `VMEM_DESKTOP_SMOKE_OK` and exits 0. It does not write events or post. Native failures are logged to stderr and do not stop the run. On Linux CI, run under `xvfb-run -a`. `--no-sandbox` is needed when `chrome-sandbox` is not set up (typical in CI containers).

## Tests and packaging

```bash
pnpm --filter @vmem/desktop test
pnpm --filter @vmem/desktop typecheck
pnpm --filter @vmem/desktop package:linux   # release/linux-unpacked
pnpm --filter @vmem/desktop package:win     # NSIS installer (run on Windows)
pnpm --filter @vmem/desktop package:mac     # x64 and arm64 dmg (run on macOS)
```

`scripts/build.mjs` bundles the main process (with `@vmem/sdk` and `zod`), the preload script and the settings page into `dist/`. `electron` and `get-windows` stay external. `electron` is a devDependency because `electron-builder` requires it there and ships its own runtime.

Releases: push a tag `desktop-v*` or run the `Desktop` workflow manually. Windows and macOS build on native runners, then a `publish` job creates the GitHub Release. Installers are unsigned.
