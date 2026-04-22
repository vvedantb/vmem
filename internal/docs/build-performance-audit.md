# Vercel Build Performance Audit — `apps/web`

_Captured 2026-04-22 from a staging deploy. Revisit when ready to act._

## Baseline (before any changes)

**Total build time: ~3m 16s** (deploy `staging@39a1260`)

| Phase                                     | Duration   | Notes                                         |
| ----------------------------------------- | ---------- | --------------------------------------------- |
| Clone + cache restore                     | ~5s        | Fine                                          |
| `pnpm install` (all 8 workspace projects) | ~18s       | Installs mobile/ext/mcp/docs too              |
| `tsc -b`                                  | **~24s**   | Runs before Vite — redundant on deploy path   |
| `vite build` (rolldown)                   | **~19s**   | `@rolldown/plugin-babel` = 58% of plugin time |
| Deploy                                    | ~3s        | Fine                                          |
| **Build cache create + upload (674 MB)**  | **~2m 5s** | **Biggest sink by far (~63% of total)**       |

Projected after fixes 1–3 below: **~1m 10-20s**, cache ~200-250 MB.

## Red flags in the bundle output

- `vendor-webllm`: 6,002 kB (lazy ✓)
- `vendor-transformers`: 1,391 kB (lazy ✓)
- `vendor-kokoro`: 1,329 kB (lazy ✓)
- `ort-wasm-simd-threaded.jsep`: 21,596 kB (transitive of transformers/kokoro)
- `ort-wasm-simd-threaded.asyncify`: 23,543 kB (same)
- `emacs-lisp`: 779 kB, `cpp`: 626 kB, `wolfram`: 262 kB, plus ~150 other language chunks (ada, apex, abap, awk, bat, cobol, crystal, elm, erlang, fennel, gleam, haxe, hy, julia, moonbit, nim, ocaml, pkl, prolog, purescript, raku, racket, ron, wenyan, zenscript, …) — **all from `@streamdown/code`**
- `@rolldown/plugin-babel` flagged by Vite's plugin timing as 58% of build time

## What's already correct (don't touch)

- `@mlc-ai/web-llm` dynamically imported in `apps/web/src/lib/local-engine.ts:42` and gated behind `loadModel()` in `LocalLLMContext.tsx`.
- `@huggingface/transformers` dynamically imported in `apps/web/src/lib/voice/stt-engine.ts:73` inside `loadSTT()`.
- `kokoro-js` dynamically imported in `apps/web/src/lib/voice/tts-engine.ts:90` inside `loadTTS()`.
- `onnxruntime-web` is transitive — rides along with transformers/kokoro chunks automatically.
- `tanstackRouter({ autoCodeSplitting: true })` in `vite.config.ts:73-78` splits every route into its own chunk.
- `rolldownOptions.codeSplitting.groups` (lines 116–165) correctly isolates heavy vendor chunks.

---

## Fix 1 — Vercel install filter + `.vercelignore`

**Saving: ~60–90s** (biggest single win; attacks the 674 MB cache)

### Problem

`apps/web/vercel.json` only has rewrites. No `installCommand`, no `buildCommand`. Vercel runs `pnpm install` at repo root with no filter, so it installs deps for every workspace project (`apps/mobile` with Expo/RN/Metro, `apps/chrome-extension`, `apps/mcp`, `apps/docs`, `packages/*`). Those `node_modules/` all end up in the 674 MB build cache and get uploaded every deploy.

### Fix

Add to `apps/web/vercel.json`:

```json
{
  "installCommand": "cd ../.. && pnpm install --filter web... --frozen-lockfile",
  "buildCommand": "cd ../.. && pnpm --filter web build",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Plus add `.vercelignore` at repo root excluding `apps/mobile`, `apps/chrome-extension`, `apps/mcp`, `apps/docs`, and any `.tsbuildinfo` files.

### Caveats from research

- Vercel forces `pnpm` when it sees `pnpm-lock.yaml` regardless of `installCommand` — the `cd ../..` workaround is still required.
- `--filter web...` (trailing `...`) pulls in workspace deps (`@vmem/backend`, `@vmem/ui`).
- Vercel's auto-monorepo detection can additionally skip builds entirely for unchanged projects (Ignored Build Step).

### Sources

- [Using Monorepos — Vercel Docs](https://vercel.com/docs/monorepos)
- [Understanding Monorepos — Vercel Academy](https://vercel.com/academy/production-monorepos/understanding-monorepos)
- [Monorepo: Using PNPM and Deploying to Vercel — Medium (real migration 4m → 2m)](https://medium.com/@brianonchain/monorepo-using-pnpm-and-deploying-to-vercel-0490e244d9fc)
- [Vercel forcing pnpm despite installCommand — Vercel Community](https://community.vercel.com/t/vercel-forcing-pnpm-instead-of-npm-despite-installcommand-configuration-in-monorepo/30118)

---

## Fix 2 — Remove `tsc -b &&` from build script, move typecheck to CI

**Saving: ~24s**

### Problem

`apps/web/package.json:8`:

```json
"build": "tsc -b && vite build"
```

That runs a full TypeScript compile before Vite. Vite already handles TS transpilation via esbuild + Babel, so this is only useful as a type-check gate. On the deploy path it burns ~24s every build.

### Fix

```json
"build": "vite build",
"typecheck": "tsc -b"
```

Move typecheck to a parallel CI job (GitHub Actions), keeping it out of the Vercel critical path. Root `package.json:21` already has `"typecheck": "pnpm --filter web typecheck"`.

### Evidence from Vite maintainers

Maintainer **rschristian** in [Discussion #18543](https://github.com/vitejs/vite/discussions/18543):

> Whether you run a type-checking step, and how you run it, is entirely up to you — it's outside the scope of Vite.

Templates include `tsc -b && vite build` as a convenience, not a mandate.

### Key detail

If you keep a typecheck step, **use `tsc -b` not `tsc --noEmit`** — build mode respects project references and catches errors in config files like `vite.config.ts` that plain `--noEmit` would miss.

### Alternative

[`vite-plugin-checker`](https://www.npmjs.com/package/vite-plugin-checker) runs typecheck in a worker during dev with HMR and exits non-zero on `vite build` failures. Build-time type safety without a serial `tsc` pass. ~1M weekly downloads.

### Sources

- [Should Vite do type-checking on builds by default? — Vite Discussion #18543](https://github.com/vitejs/vite/discussions/18543)
- [Ignoring all Typescript errors on build — Vite Discussion #6716](https://github.com/vitejs/vite/discussions/6716)
- [vite-plugin-checker — npm](https://www.npmjs.com/package/vite-plugin-checker)

---

## Fix 3 — Drop (or narrow) `@rolldown/plugin-babel` + `reactCompilerPreset()`

**Saving: ~10–12s** (reclaims the 58% plugin-time share)

### Problem

`apps/web/vite.config.ts:80-82`:

```ts
babel({
  presets: [reactCompilerPreset()],
}),
```

`@vitejs/plugin-react` **v6 (current)** dropped Babel in favor of **Oxc (Rust)** for JSX + Fast Refresh. But React Compiler is still a Babel plugin, so enabling it reintroduces Babel via `@rolldown/plugin-babel` — **undoing the Oxc perf win Vite 8 was designed for**.

### Evidence

From the [Vite 8 announcement](https://vite.dev/blog/announcing-vite8):

> Babel is no longer a dependency and the installation size is smaller… For projects that need the React Compiler, v6 provides a reactCompilerPreset helper that works with @rolldown/plugin-babel, giving you an explicit opt-in path without burdening the default setup.

From the [reactwg/react-compiler discussion on vite-rolldown](https://github.com/reactwg/react-compiler/discussions/69):

> Continuing to use Babel plugins, particularly the React Compiler plugin with @vitejs/plugin-react v5, will hinder the full performance benefits of switching to rolldown.

From the [React Compiler 1.0 blog post](https://react.dev/blog/2025/10/07/react-compiler-1):

> While the initial stable version of the compiler will remain primarily a Babel plugin, developers are working with the swc and oxc teams to build first class support for React Compiler so you won't have to add Babel back to your build pipelines in the future.

Next.js already solved this with SWC — per [Next.js reactCompiler docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/reactCompiler):

> Next.js includes a custom performance optimization written in SWC that makes the React Compiler more efficient, analyzing your project and only applying the React Compiler to relevant files, which avoids unnecessary work and leads to faster builds compared to using the Babel plugin on its own.

Vite doesn't have an equivalent yet.

### Is it worth keeping?

React Compiler is **additive** — the React team explicitly says don't strip `useMemo`/`useCallback` on the assumption the compiler replaces them. If you haven't **measured** a render-perf win from the compiler specifically, removing it is safe.

### Three options, ranked

1. **Remove it entirely** — delete the `babel()` entry + `reactCompilerPreset` import. Fastest build, no runtime impact unless you measured a win. **Recommended unless proven otherwise.**
2. **Narrow scope** — use Babel's `filter`/`include` to run the compiler only on a specific directory (e.g. `src/components/heavy/**`). Partial savings, same runtime benefit for hot paths.
3. **Keep as-is** — wait for native oxc/swc support in Vite.

### Sources

- [React Compiler 1.0 + Vite 8: The Right Way to Install After @vitejs/plugin-react v6 Drops Babel — DEV](https://dev.to/recca0120/react-compiler-10-vite-8-the-right-way-to-install-after-vitejsplugin-react-v6-drops-babel-p0i)
- [Vite 8.0 announcement — vite.dev](https://vite.dev/blog/announcing-vite8)
- [React Compiler v1.0 — React blog](https://react.dev/blog/2025/10/07/react-compiler-1)
- [React Compiler Installation (Vite) — React docs](https://react.dev/learn/react-compiler/installation)
- [Future Plans for React Compiler and vite-rolldown — reactwg Discussion #69](https://github.com/reactwg/react-compiler/discussions/69)
- [next.config.js: reactCompiler — Next.js docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/reactCompiler)
- [@vitejs/plugin-react CHANGELOG](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/CHANGELOG.md)

---

## Fix 4 — Trim Shiki languages in Streamdown (drop or replace `@streamdown/code`)

**Saving: large cache drop + faster cold builds** (kills ~150 language chunks)

### Problem

`packages/ui/src/ai-elements/message.tsx:5-9`:

```ts
import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code"; // ← pulls ALL Shiki languages
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
```

`streamdown@2.2.0` itself advertises an 83.5% bundle reduction via CDN-loaded assets. But `@streamdown/code` re-adds the full Shiki language set — explaining the 150+ language chunks in the build output.

### Evidence (known issue, not user error)

- **[vercel/streamdown#74](https://github.com/vercel/streamdown/issues/74)** — _"It doesn't allow me to select which languages I want to include as it automatically imports all available languages, which adds a lot of KBs."_ Labeled enhancement. PR #295 partially addressed this.
- **[vercel/streamdown#315](https://github.com/vercel/streamdown/issues/315)** (Dec 2025) — requests `disableShiki` / `disableMermaid` props. Not yet landed.
- **[Shiki Bundles guide](https://shiki.style/guide/bundles)**: _"fine-grained bundles help you compose languages and themes one-by-one as needed… better for web applications or performance-sensitive environments."_

### Three options, ranked

1. **Drop `@streamdown/code`** and fall back to Streamdown's default (no syntax highlighting). Simplest. Acceptable if nobody needs highlighted code in chat responses.
2. **Replace with a custom Shiki-backed code renderer** using `createHighlighterCore` + a narrow language set (js, ts, tsx, jsx, json, bash, py, md, sql, html, css — whatever you actually ship). Maximum control, more work.
3. **Lazy-load the whole `<MessageResponse>` component** so Shiki chunks don't block the initial deploy. Doesn't reduce build time but reduces what users download.

### Sources

- [Streamdown v2: Smaller bundle, CDN loading — daily.dev](https://app.daily.dev/posts/streamdown-v2-smaller-bundle-cdn-loading-and-new-remend-options-0jpiws4bj)
- [Streamdown — streamdown.ai](https://streamdown.ai/)
- [Bundle size — vercel/streamdown#74](https://github.com/vercel/streamdown/issues/74)
- [Option to disable shiki and mermaid — vercel/streamdown#315](https://github.com/vercel/streamdown/issues/315)
- [Shiki Bundles guide — shiki.style](https://shiki.style/guide/bundles)
- [Shiki Installation & Usage — shiki.style](https://shiki.style/guide/install)

---

## Fix 5 — Add Turborepo + Vercel Remote Cache

**Saving: 30–60s on incremental deploys (not first deploy)**

### Problem

No `turbo.json`. Every Vercel deploy rebuilds everything from scratch, even if only a doc file changed.

### Fix

Add Turborepo at root with a `build` pipeline declaring outputs (`apps/web/dist`). Vercel Remote Cache is **free on all plans**, automatically enabled for Turborepo projects, and works even if you don't host on Vercel.

### Evidence

From [Vercel Remote Caching docs](https://vercel.com/docs/monorepos/remote-caching):

> Vercel automatically enables remote caching for Turborepo projects… automatically skips builds for projects in a monorepo that are unchanged by the commit.

Cache key is content-hash based — _"only the files you changed will be rebuilt."_

> Vercel Remote Cache is free for all plans, subject to fair use guidelines. Additionally, you do not need to host your project on Vercel to use Vercel Remote Caching.

### Sources

- [Deploying Turborepo to Vercel](https://vercel.com/docs/monorepos/turborepo)
- [Vercel Remote Caching docs](https://vercel.com/docs/monorepos/remote-caching)
- [Iterate faster with Turborepo and Vercel Remote Cache — Vercel blog](https://vercel.com/blog/vercel-remote-cache-turbo)
- [Remote Caching Setup — Vercel Academy](https://vercel.com/academy/production-monorepos/remote-caching)

---

## Final priority ranking

| #   | Fix                                         | Saving                | Risk                            | Effort     | Confidence                                 |
| --- | ------------------------------------------- | --------------------- | ------------------------------- | ---------- | ------------------------------------------ |
| 1   | Vercel install filter + `.vercelignore`     | ~60–90s               | None                            | Low        | **High** — documented pattern              |
| 2   | Remove `tsc -b &&`, move typecheck to CI    | ~24s                  | Low — regain via CI             | Trivial    | **High** — maintainer-approved             |
| 3   | Remove React Compiler (unless measured win) | ~10–12s               | Low — additive feature          | Trivial    | **High** — official guidance says additive |
| 4   | Drop/replace `@streamdown/code`             | Large cache drop      | Low — loses syntax highlighting | Low–Medium | **High** — known issue                     |
| 5   | Add Turborepo + Remote Cache                | 30–60s on incremental | Low — additive                  | Medium     | **High** — first-party Vercel feature      |

**Biggest unknown:** whether React Compiler is earning its keep (fix 3). If render perf hasn't been profiled, removing it is the easiest +10s that also restores the full Oxc benefit Vite 8 was designed for.

**Do fixes 1 + 2 first** — they're trivial and cut ~90s off every deploy.
