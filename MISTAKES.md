# MISTAKES.md

Append-only. One short bullet per mistake agents or humans should not repeat.

- Enabling oxlint `categories.correctness` / `suspicious` globally floods Convex
  with `no-underscore-dangle` on `_id` / `_creationTime`. Prefer explicit rules
  over broad categories until those are allowlisted.
