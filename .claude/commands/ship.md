---
model: haiku
---

Stage relevant files, commit, and push to remote.

1. **Changelog first (if needed):** If this session includes medium-to-large user-facing changes and you have not yet updated `internal/changelog.md` for them, run the `/changelog` command (see `.claude/commands/changelog.md`) before staging. Skip when the changelog is already current or changes are only small fixes.
2. Run `git status -u` and `git log --oneline -5` in parallel
3. Identify session-related files, excluding pre-existing dirty files
4. Stage with `git add` using specific paths (never `git add -A` or `.`)
5. Write commit message following repo convention (lowercase prefix: feat/fix/refactor) — title summarizes WHY, not WHAT. Add a body (separated by blank line) explaining the reasoning/context in 1-3 short lines.
6. Commit with HEREDOC (title + blank line + body), then `git push`
7. Print commit hash and summary
