---
model: haiku
---

Stage relevant files, commit, and push to remote.

1. Run `git status -u` and `git log --oneline -5` in parallel
2. Identify session-related files, excluding pre-existing dirty files
3. Stage with `git add` using specific paths (never `git add -A` or `.`)
4. Write commit message following repo convention (lowercase prefix: feat/fix/refactor) — title summarizes WHY, not WHAT. Add a body (separated by blank line) explaining the reasoning/context in 1-3 short lines.
5. Commit with HEREDOC (title + blank line + body), then `git push`
6. Print commit hash and summary
