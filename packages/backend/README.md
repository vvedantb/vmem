# @vmem/backend

Convex backend for vmem.

## Schema

| Table            | Description                                                                 |
| ---------------- | --------------------------------------------------------------------------- |
| `users`          | Clerk-linked user records, indexed by `clerkId` and `email`                 |
| `memories`       | User memories with `title`, `content`, `tags[]`, timestamps                 |
| `apiKeys`        | API keys — AES-GCM encrypted at rest, hashed for lookup, masked for display |
| `apiRequestLogs` | Per-key request logs with endpoint, method, HTTP status, duration           |

## Modules

- `auth.ts` — `ensureUserExists`, `me`, and custom auth builders (`authQuery`, `authMutation`, `authAction`) that inject `ctx.userId`
- `apiKeys.ts` — create, list, revoke, reveal (decrypt) API keys; internal mutation for usage recording
- `apiLogs.ts` — query API request logs per user/key

## Auth Builders

All protected functions use builders from `auth.ts` rather than raw `query`/`mutation`/`action`. These verify the Clerk identity and inject `ctx.userId` as a Convex `Id<"users">`.

```ts
import { authQuery, authMutation, authAction } from "./auth";
```

## Environment

`ENCRYPTION_KEY` — base64-encoded AES-256 key, set in Convex environment variables (not `.env`).

## Run

```bash
pnpm --filter @vmem/backend dev
```
