---
name: typecheck
description: Run TypeScript type checking on the codebase
disable-model-invocation: true
allowed-tools: Bash(npx tsc *)
---

Run `npx tsc --noEmit` in the appropriate codebase directory (check for the nearest `tsconfig.json`). Report any errors found and fix them.
