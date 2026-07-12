# DESIRES.md

Append-only. Missing tools, docs, or context that would have made a task easier.

- Promote knip `dependencies` / `unlisted` from off → error after removing or
  wiring unused packages (`youtube-transcript`, mobile portals, etc.).
- 2026-07-12 (desloppify PR): partially resolved the above. Promoted
  `nsExports` / `nsTypes` / `enumMembers` / `duplicates` / `binaries` from
  off → error, and closed two blind spots that would have false-positived
  once other rules turned on (backend `scripts/**/*.mjs` esbuild usage;
  chrome-extension `tailwindcss` / `tailwindcss-animate`, invisible because
  `vite: false`). `dependencies` / `unlisted` / `exports` / `types` stay off
  — turning them on today surfaces real, unresolved findings: unused deps
  (`youtube-transcript`, `@rn-primitives/portal`, `expo-dev-client`,
  `expo-file-system`, `expo-system-ui`), an unlisted `vite/client` triple-
  slash reference in `packages/backend/convex/auth.test.ts`, and ~69 unused
  exports/types across apps/web, packages/sdk, packages/ui, and
  oxlint-plugin-vmem. Also found but out of this PR's scope: a third blind
  spot in `apps/mobile` — `expo-font` / `expo-status-bar` are used only as
  `app.config.ts` plugin-string entries, invisible because `expo: false`.
