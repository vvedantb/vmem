# Chrome extension live signed-in matrix

Follow-up to #156. Credentials are env-only (`VMEM_TEST_EMAIL` / `VMEM_TEST_PASSWORD`); they are not in git.

Account: `eva@vedantb.com` against `https://vmem.vedantb.com` (Convex `https://clear-bear-690.eu-west-1.convex.cloud`).

Run: `pnpm ext:build && pnpm --filter @vmem/chrome-extension test:e2e:live`

## Matrix (headed Chromium 148, same profile as unpacked `dist/chrome-mv3`)

| Check             | Result         | Notes                                                                                                                                                                                 |
| ----------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web sign-in       | **pass**       | Clerk modal on `vmem.vedantb.com` → `/home` as Eva                                                                                                                                    |
| Popup cookie sync | **partial**    | Popup shows Save / Import after copying `__client` onto the sync host. Native `chrome.cookies.get({ url: vmem.vedantb.com, name: "__client" })` is null                               |
| Alt+S / save page | **fail**       | `Not authenticated - please sign in via the extension popup`. `session:authToken` never populated                                                                                     |
| Memory listed     | **skipped**    | No memory created (account still `0 total`)                                                                                                                                           |
| Cleanup           | **skipped**    | Nothing to delete                                                                                                                                                                     |
| ChatGPT inject    | **logged-out** | `chatgpt.com` reachable without a ChatGPT session. `[data-vmem]` Use vmem injects next to the composer. Export control (`[data-vmem-action=export]`) not found — header selector miss |

## Cookie jar after web sign-in (names/domains only)

- `__client` — `.clerk.vedantb.com` (HttpOnly)
- `__session` / `__session_*` — `vmem.vedantb.com`
- `__client_uat` — `.vedantb.com`

`@clerk/chrome-extension` reads `__client` at `syncHost` (`https://vmem.vedantb.com`). Production Clerk stores that cookie on the FAPI host, so the extension does not see a native session. The live harness copies `__client` onto `vmem.vedantb.com` for the popup; Clerk UI then shows signed-in, but `TokenSync` never writes a Convex JWT (`token=false` after 20s).

## Product fix landed here

`savePageFromTab` ran Turndown in the MV3 service worker (`document is not defined`). It now falls back to extracted text so Alt+S can proceed once auth is present.

## Remaining gap

Background `createMemory` still fails until the popup (or SW Clerk client) can mint `getToken({ template: "convex" })` from a real `__client` cookie on the sync host. Aligning Clerk cookie domain with `VITE_CLERK_SYNC_HOST`, or pointing `syncHost` at `https://clerk.vedantb.com`, is the likely product follow-up.
