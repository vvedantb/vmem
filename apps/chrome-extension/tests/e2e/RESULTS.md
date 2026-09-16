# Chrome extension live signed-in matrix

Follow-up to #156 / #157. Credentials are env-only (`VMEM_TEST_EMAIL` / `VMEM_TEST_PASSWORD`); they are not in git.

Account: `eva@vedantb.com` against `https://vmem.vedantb.com` (Convex `https://clear-bear-690.eu-west-1.convex.cloud`).

Run: `pnpm ext:build && pnpm --filter @vmem/chrome-extension test:e2e:live`

## Matrix (headed Chromium 148, same profile as unpacked `dist/chrome-mv3`)

| Check             | Result      | Notes                                                                                                                                                        |
| ----------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web sign-in       | **pass**    | Clerk modal on `vmem.vedantb.com` → `/home` as Eva                                                                                                           |
| Popup cookie sync | **pass**    | Popup shows Save / Import. `session:authToken` populated (`token=true`). Native `chrome.cookies.get(__client)` / `getAll` still empty                        |
| Alt+S / save page | **pass**    | Service-worker `save-page` returned a Convex `memoryId`                                                                                                      |
| Memory listed     | **pass**    | Example Domain row on `/memories/list`                                                                                                                       |
| Cleanup           | **pass**    | Deleted the Example Domain test rows (empty list + “Memory deleted successfully”)                                                                            |
| ChatGPT inject    | **partial** | Logged-out `chatgpt.com`. `[data-vmem]` Use vmem injects next to the composer. Export control (`[data-vmem-action=export]`) not found — header selector miss |

## Cookie jar after web sign-in (names/domains only)

- `__client` — `.clerk.vedantb.com` (HttpOnly, CHIPS)
- `__session` / `__session_*` — `vmem.vedantb.com` (page `document.cookie` can read it)
- `__client_uat` — `.vedantb.com`

`chrome.cookies.get` / `getAll` from the extension popup remain empty on this Chrome 148 profile. CDP `Network.getAllCookies` still sees the jar.

## Mint probe (no JWT values logged)

Page `fetch` of Clerk `…/tokens/convex`:

- `credentials: "include"` (web cookie path) → HTTP 200, response contains `"jwt"`
- Bearer `__session` + `_is_native=1` → HTTP 400, no jwt

So the durable product path is the MAIN-world content script mint with page cookies, not Clerk's native Bearer session JWT and not `chrome.cookies`.

## Product fix landed here

1. MAIN-world CS on `https://vmem.vedantb.com/*` POSTs `tokens/convex` with `credentials: include` and `window.postMessage`s the Convex JWT to the isolated CS, which stores `session:authToken`.
2. Isolated CS still retries the `__session` Bearer mint as a fallback (live: Clerk rejects that with 400).
3. Popup `TokenSync` no longer writes `session:authToken=""` when `getToken()` returns null, so it cannot wipe a page-minted JWT.
4. `savePageFromTab` still falls back when Turndown runs in the MV3 service worker (`document is not defined`).
