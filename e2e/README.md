# Playwright E2E (web)

Durable browser suite for the vmem web app. Default target is production so CI and other agents do not need a local Convex/Clerk stack.

**App:** https://vmem.vedantb.com  
**Convex prod:** clear-bear-690  
**Auth:** Clerk test user `eva@vedantb.com` via Playwright `storageState` (one login in the `setup` project).

This is a foundation suite (smoke-depth per surface). Add deeper specs next to the existing files; keep helpers in `e2e/helpers/`.

## Secrets

Never commit passwords. Copy `e2e/.env.example` to `e2e/.env.local` or export:

| Variable            | Required                    | Default                                        |
| ------------------- | --------------------------- | ---------------------------------------------- |
| `E2E_USER_EMAIL`    | recommended                 | `eva@vedantb.com`                              |
| `E2E_USER_PASSWORD` | yes for authenticated specs | —                                              |
| `E2E_BASE_URL`      | no                          | `https://vmem.vedantb.com`                     |
| `E2E_WEB_SERVER`    | no                          | unset. Set `1` to boot `pnpm --filter web dev` |

Without `E2E_USER_PASSWORD`, only the signed-out `unauth` project (landing) runs.

GitHub Actions: set repository secrets `E2E_USER_EMAIL` and `E2E_USER_PASSWORD`. The `e2e.yml` workflow already wires them through.

## Commands

From the repo root (after `pnpm install`):

```bash
pnpm exec playwright install chromium   # once per machine
pnpm test:e2e                           # full suite (prod URL)
pnpm test:e2e:headed                    # headed Chromium
pnpm test:e2e:smoke                     # @smoke tag only
pnpm test:e2e:ui                        # Playwright UI mode
```

Local Vite preview:

```bash
pnpm dev                                # http://localhost:5173
E2E_BASE_URL=http://localhost:5173 pnpm test:e2e
# or let Playwright start Vite:
E2E_WEB_SERVER=1 E2E_BASE_URL=http://localhost:5173 pnpm test:e2e
```

## Sharding

Grep tags (title + Playwright `tag`):

```bash
pnpm test:e2e -- --grep @landing
pnpm test:e2e -- --grep @home
pnpm test:e2e -- --grep @memories
pnpm test:e2e -- --grep @graph
pnpm test:e2e -- --grep @tags
pnpm test:e2e -- --grep @skills
pnpm test:e2e -- --grep @wiki
pnpm test:e2e -- --grep @files
pnpm test:e2e -- --grep @inbox
pnpm test:e2e -- --grep @activity
pnpm test:e2e -- --grep @settings
pnpm test:e2e -- --grep @nav
pnpm test:e2e -- --grep @auth
pnpm test:e2e -- --grep @smoke
```

Native shard (CI agents):

```bash
pnpm test:e2e -- --shard=1/4
pnpm test:e2e -- --shard=2/4
```

HTML report: `e2e/playwright-report/` (open with `pnpm exec playwright show-report e2e/playwright-report`). Trace on failure is retained under `e2e/test-results/`.

## Layout

| Path                       | Role                                                               |
| -------------------------- | ------------------------------------------------------------------ |
| `e2e/playwright.config.ts` | baseURL, projects, trace, HTML report                              |
| `e2e/auth.setup.ts`        | Clerk login → `e2e/.auth/user.json`                                |
| `e2e/fixtures.ts`          | waits out `/home` → `/$profileId/home` (ActiveProfileProvider)     |
| `e2e/helpers/`             | env, auth, nav, shell, disposable memories                         |
| `e2e/specs/`               | one file per product area (`auth.spec.ts` covers session/sign-out) |

Authenticated tests depend on the `setup` project. Landing runs without storage so signed-in redirects cannot hide the marketing page.

## CI

`.github/workflows/e2e.yml`:

- **PRs / pushes to main+staging:** `@smoke`
- **Nightly cron + workflow_dispatch `full`:** entire suite

Unit CI in `test.yml` is unchanged.

## Known flakes

- **Clerk bot protection / CAPTCHA** on the hosted sign-in modal. Retry once (`retries: 1` on CI). If setup keeps failing, complete a login locally and inspect `e2e/test-results`.
- **`/home` workspace redirect** used to race `useActiveProfile` before the profile query resolved. Current main wraps the outlet in `ActiveProfileProvider` with the loaded profile; fixtures still wait for `/$profileId/...` plus `#main-content` before clicking sidebar.
- **Dashboard stats** are a Convex action — allow ~30s for "Total memories".
- **Graph WebGL** may be empty on a fresh workspace (`No memories to visualize`) or skip in environments without WebGL2. The spec accepts canvas or the empty heading and fails on "Failed to load graph".
- **Search after create** is hybrid; the list spec uses a unique `e2e-list-<timestamp>` title and always attempts delete in `catch`.
- **Do not** leave `e2e-*` memories behind. The list spec deletes the row it created.

Chrome extension e2e (`pnpm --filter @vmem/chrome-extension test:e2e`) is a separate Puppeteer harness and is not this suite.
