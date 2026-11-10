# @vmem/mobile

Android activity tracker for vmem. It records which apps you use and for how long. That usage stays on the phone and is never uploaded. It also takes text and links that you share to it, quick notes (typed or spoken) and clipboard text. Every uploadable capture waits in a review queue on the phone. Nothing goes to vmem until you approve it. Approved items are saved as episodic memories through the same HTTP API that the desktop recorder uses.

This app is a tracker, like `apps/desktop`. It is not a copy of the web dashboard.

- Android only. Distribution is by sideload through V Store, not Google Play. Play policies for Usage Access and package visibility do not apply.
- Expo SDK 57 (React Native 0.86), Expo Router, `@vvedantb/native-ui` 0.7.0 with its floating tab bar, shared Tailwind preset (`/tailwind-preset`) and auth screens (`/auth`).
- Native code: a local Expo module in `modules/vmem-tracker` (Kotlin, WorkManager, SQLite, UsageStatsManager).

## Run

```bash
pnpm install
pnpm --filter @vmem/mobile prebuild   # generates ./android (git-ignored)
pnpm --filter @vmem/mobile android    # debug build on a device or emulator; needs JDK 17 and the Android SDK
pnpm --filter @vmem/mobile start      # Metro only, for a debug build that is already installed
```

The app uses a native module, so Expo Go cannot run it. Use a debug build.

Defaults point at production: sign-in on `clerk.projectv.uk` and uploads to `https://clear-bear-690.eu-west-1.convex.site`. To use the preview sign-in instance or another Convex deployment, copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` or `EXPO_PUBLIC_VMEM_BASE_URL`.

## Sign-in

Sign-in uses Clerk through `@vvedantb/native-ui/auth`, as the Verve and vibot apps do: `AuthProviders` (Clerk only, no Convex client) with `tokenCache` from `@clerk/clerk-expo/token-cache`, and the package `SignInScreen` and `SignUpScreen` in `app/(auth)/`. They offer Google (`useSSO()`) first, then email and password, with an emailed code for sign-up. It is the same Clerk instance as vmem web, so existing accounts work. The app copy does not name the provider.

No Clerk dashboard change is needed:

- Email and password need no redirect. They work as they do on the web.
- Google sign-in uses the redirect of the archived app, `AuthSession.makeRedirectUri({ scheme: "vmem", path: "sso-callback" })`, which is `vmem://sso-callback` in a release build. The `app/sso-callback.tsx` route is kept.
- The Android package is `com.projectvdotuk.vmem`, the same pattern as the other Project V apps. The URL scheme (`vmem`) is the archived app's scheme. The redirect depends on the scheme only, so it needs no new allowlist entry if the archived app's redirect is still allowlisted on the instance. If the instance has a Native applications entry keyed to the package, the new package could need one. This repository cannot read the dashboard to confirm either. If Google sign-in fails with a redirect error, email and password still work.

The app does not use the desktop MCP OAuth flow, and it needs no `CLERK_SECRET_KEY`.

## Permissions

| Permission                                | Why                                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Usage Access (`PACKAGE_USAGE_STATS`)      | Reads which app is in the foreground and when. You grant it in Settings, Apps, Special app access, Usage access. The app links there. |
| `RECEIVE_BOOT_COMPLETED`                  | Schedules collection again after a reboot.                                                                                            |
| `RECORD_AUDIO`                            | Voice notes only, while you record. Added by the `expo-audio` config plugin, with background recording and playback off.              |
| `INTERNET`                                | Uploads approved items.                                                                                                               |
| `<queries>` for launcher and home intents | Shows app names instead of package names on Android 11 and later. The app does not ask for `QUERY_ALL_PACKAGES`.                      |

The app does not read screen content, notifications, messages or keystrokes in phase 1.

## What is recorded

- **App use.** The collector turns UsageStatsManager foreground events into sessions (app, start, end). The screen turning off or locking ends a session. The app makes one review item per app per UTC hour, for example `Used Chrome for 25 min`, with the sessions listed in the content. An hour becomes an item only after it is over, so an item never changes after you see it. An app used for less than one minute in an hour makes no item.
- **Shares.** Share text or a link from any app to "Save to vmem". It becomes one review item. Sharing works while recording is paused, because you start it yourself.
- **Share notes.** A share in Review has a note box. **Add note** appends `Your note: …` to the item content before you approve it. The title and the `android-share` source do not change.
- **Quick note.** The Capture tab saves typed text as a review item (source `android-note`, `externalId` `android:note:<hash>`).
- **Voice note.** Record on the Capture tab. The app records only while you record, then posts the audio to `POST /api/v1/mobile/transcribe` with the Clerk session token. The server transcribes it with `openai/gpt-4o-mini-transcribe` through the AI Gateway and does not store the audio. The text goes into the note box for you to edit, then Save note. It needs `AI_GATEWAY_API_KEY` on the Convex deployment, else the server answers 422.
- **Clipboard.** **Save clipboard** reads the clipboard only when you tap it, never in the background. It removes obvious secrets first (`vmem_sk_…` and `sk-…` keys, GitHub tokens, JWTs, Bearer tokens, one-time codes in `src/capture/redact.ts`). Source `android-clipboard`, `externalId` `android:clipboard:<hash>`.
- **Calendar (opt-in).** Off by default. Settings > Calendar turns it on and asks for the read-only `READ_CALENDAR` permission. If you refuse, it stays off. When on, each app open reads events of past local days and of today, including meetings later today (yesterday on the first run, at most three days back; past days are read once, and today is read again on every app open, so an event added later today is seen; an event that is already stored is not added twice) into raw `calendar` events (`CalendarCollector.kt`, `text` is a JSON object, no listener, no background work). Declined and cancelled events are skipped, and so are all-day events without guests. The app then posts each day to `POST /api/v1/mobile/calendar/summarize`. The server summarises it with the AI Gateway chat model (`alibaba/qwen3.7-flash`, thinking off) and stores nothing. The app makes one day item (`Calendar: Tuesday 10 Nov`, `externalId` `android:calendar:day:<installId>:<YYYY-MM-DD>`) and one item per meeting (`android:calendar:event:<hash>`). Both wait in Review. Source and sourceType are `android-calendar`, an intentional medium-prior source. If the server cannot summarise (no `AI_GATEWAY_API_KEY` gives 422, a bad model reply gives 502), the app shows an error, makes no item and keeps the raw events for the next sync. Turning Calendar off deletes unsent raw calendar events.
- **Usage is local-only.** App-use sessions are never uploaded. They stay on the phone.
- **Never recorded:** vmem itself, the home screen, the system UI and every app on the blocked list.

Recording starts when the app first runs with Usage Access. It does not import usage from before that time. Time while paused, while Usage Access is off, or while the phone is off is not recorded later.

## Review queue

1. Native collectors write raw events into SQLite (`events` table): app sessions from WorkManager every 15 minutes, and shares from the share target. This works while the JS app is closed.
2. When the app opens or returns to the foreground, it collects up to now and builds review items from the raw events (`src/capture`). It writes them to the `queue` table as `pending_review` and deletes the events they used.
3. **Approve** or **Approve all** sets `approved`. The app uploads at once with `@vmem/sdk`. A row becomes `uploaded` after the server accepts it.
4. **Discard** deletes the row. Nothing is sent.
5. While paused, collectors record nothing. You can still review and send items.

Each item has a stable `externalId` (`android:share:<hash of the text>`, `android:note:<hash>`, `android:clipboard:<hash>` or `android:calendar:…`). The backend upserts on it, so a retry or a double post updates one memory and does not add a second one.

Retention on the phone: sent items stay for 7 days, so the Review tab can show them. Raw events that never became an item are deleted after 30 days. **Settings, Delete all local data** removes the queue, raw events and the stored token. Settings (pause and blocked apps) stay. **Sign out** also deletes items that are not sent yet, so another account cannot send them.

### Upload payload

```ts
{
  title: "Used Chrome for 25 min",
  content: "Active in Chrome on Android from 2026-01-05 10:02 to 10:48 UTC.\nScreen time: 25 min over 2 sessions.\n...",
  type: "episodic",
  source: "android",
  sourceType: "android",
  tags: ["android", "activity", "chrome"],
  externalId: "android:usage:<install id>:com.android.chrome:2026-01-05T10",
}
```

Shares use the tags `android` and `share` (and `link` with a URL). They carry `url` when the text holds a link. The backend ranks `android` as a low-prior source, like `desktop` (`LOW_SOURCES` in `packages/backend/engine/memory/usefulness.ts`). Android rows skip LLM entity extraction, and nightly dreaming can archive stale ones.

## Pause and the Quick Settings tile

Pause is in Settings and on the Review tab. The **vmem recording** Quick Settings tile toggles it from anywhere: add it in the Quick Settings editor. Pausing first collects up to now, so activity before the pause is kept. Resuming starts again from now. The pause flag is stored natively, so WorkManager respects it without JS.

## Blocked apps

Messaging apps are blocked by default (`DenyList.DEFAULTS` in `DenyList.kt`): WhatsApp, Telegram, Signal, Google and Samsung Messages, Messenger, Discord, Slack, Teams, Google Chat, Viber, LINE, WeChat, Snapchat and others. Settings, Blocked apps lets you remove an entry, add an app you used this week or type a package name, and reset to the defaults. The list is stored natively. A blocked app is not recorded at all, not even as a gap.

## Token handoff to WorkManager

Uploads use `Authorization: Bearer <Clerk session JWT>` on `POST /api/v1/memories`. The backend already accepts it: `bearerToken.ts` sends any token that is not `vmem_sk_…` to `verifyAccessToken`, which accepts the `session_token` type. No backend auth change was needed.

A session JWT lives for about 60 seconds. So:

1. While the app is open, it uploads approved items itself. Right before the first post it mints a new token with `getToken({ skipCache: true })`, never the cached one (`src/sync/store.ts`). It asks for no token when nothing is approved.
2. Each new token, and a new one when the app goes to the background, goes into the native module (`setAuthToken`). Native code reads the JWT `exp` and stores both in private SharedPreferences. The token is never logged.
3. The native `UploadWorker` posts approved items with that token, but only while it is valid for at least 10 more seconds. This covers items approved just before the app closed, or approved while offline when the phone reconnects shortly after.
4. If the token is missing or expired, or the server returns 401, items stay `approved` and no attempt is counted. A 401 also clears the stored token. They upload on the next app open, when the app has a fresh token.

Offline, 408, 429 and 5xx errors do not count against an item. Other errors count, and after 5 attempts the item shows **Try again**.

## Code map

| Path                                          | Role                                                                                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/`                                        | Expo Router screens: sign-in, sign-up, `sso-callback`, Review and Settings tabs, blocked apps.                                                                                                   |
| `src/capture/`                                | Raw events to review items: hourly usage batches, shares, the upload body, `externalId`s.                                                                                                        |
| `src/sync/`                                   | Upload with `@vmem/sdk`, and the store that syncs on open and on foreground (`useSyncExternalStore`).                                                                                            |
| `modules/vmem-tracker/src/api.ts`             | Typed JS API of the native module. Every native JSON value is parsed with zod.                                                                                                                   |
| `modules/vmem-tracker/android/…/vmemtracker/` | Kotlin: `UsageCollector`, `TrackerDatabase` (SQLite), `TrackerPrefs`, `TrackerWork` (WorkManager), `Uploader`, `ShareReceiverActivity`, `PauseTileService`, `BootReceiver`, `VmemTrackerModule`. |

## Phases 2 and 3

Phase 1 leaves these out. The module is ready for them:

- `CaptureKind` (Kotlin) and `captureKindSchema` (TS) already reserve `screen_text` (phase 2, an AccessibilityService) and `notification` (phase 3, a NotificationListenerService).
- A new collector writes raw `events` rows with its kind, applies `TrackerPrefs.denyList` and `paused`, and declares its service in the module manifest.
- `buildPromotion` in `src/capture/promote.ts` gets a batcher for the kind. Until then, events of those kinds stay in the buffer untouched.
- The review queue, upload, retention and the deny list need no change.

## Tests

```bash
pnpm --filter @vmem/mobile typecheck   # app (with the native-ui source) and tests
pnpm --filter @vmem/mobile test        # batching, summaries, externalIds, upload rules, module JS API
```

The Kotlin code compiles in the `Release Android APK` workflow (on `main`, or a manual `dry_run`).

## Release

See [RELEASE.md](./RELEASE.md).
