---
name: commit
description: Stage and commit changes with a descriptive message
disable-model-invocation: true
argument-hint: [optional message override]
allowed-tools: Bash(git *)
---

Stage and commit the current changes.

1. Run `git status` and `git diff` to see all changes
2. Run `git log --oneline -5` to match the repo's commit message style
3. Stage only the relevant changed files by name (never use `git add -A` or `git add .`)
4. Write a concise commit message that describes the "why", not the "what"
5. If $ARGUMENTS is provided, use that as the commit message instead
6. Commit and show the result with `git status`

Never push. Never skip hooks. Never amend unless explicitly told.
