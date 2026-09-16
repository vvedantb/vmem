# Mintlify docs

This branch restores `apps/docs` (and the monorepo wiring for `pnpm docs:dev`) on latest **main**.

- **Source snapshot:** `4de7dd2b` (parent of docs removal `5c9b0a3e`)
- **Target:** `main` — Convex-only product (no Neo4j / GitHub codebases / native mobile app)
- Pages that documented removed features are kept as explicit **removed** notes so old links do not look like live product surface

## Preview

```bash
pnpm docs:dev
```

Requires the [Mintlify CLI](https://www.mintlify.com/docs/installation) (`mint`) on your PATH.
