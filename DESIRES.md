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
- 2026-07-12 (desloppify PR, follow-up): promoted the last four rules
  `dependencies` / `unlisted` / `exports` / `types` from off → error; `pnpm
knip` now exits 0. Dependencies: 3 removed (`youtube-transcript`,
  `@rn-primitives/portal`, `expo-file-system` — referenced nowhere), 4 kept
  and added to the mobile `ignoreDependencies` with reasons (`expo-font` /
  `expo-status-bar` app.config plugin strings, `expo-system-ui` build-time
  userInterfaceStyle/backgroundColor, `expo-dev-client` dev-client tooling —
  all invisible under `expo: false`). Unlisted `vite/client`: added `vite` as
  a backend devDependency (removal broke `import.meta.glob` typing and no
  already-declared types source — including `vitest/importMeta` — supplies
  `glob`). The ~69 export/type findings: 25 fixed by dropping the `export`
  keyword (used only within their own file), 2 genuinely-public sdk types
  (`ScoreBreakdown` / `MatchedChunk`) wired into `src/index.ts` (dropping
  their export would break the `declaration: true` publish build via
  `MemoryCandidate`), and the rest deleted as dead — including the redundant
  `sdk/src/vmemory.ts` type re-export block and 4 dead component files
  (`EvaIcon`, `SharePointIcon`, `IconChat`, `VmemThinkingLoader`). Green:
  knip, typecheck:all, test, install --frozen-lockfile, lint:oxlint
  (0 errors / 133 warnings, unchanged).
