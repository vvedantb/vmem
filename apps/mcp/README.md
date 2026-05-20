# vmem MCP Server

> **⚠️ DEPRECATED — DO NOT USE**
>
> This Express/Railway deployment has been replaced by the inline Convex MCP
> server. New URL: `https://<your-convex-slug>.<region>.convex.site/mcp`  
> (Copy the full site URL from the Convex dashboard — URLs without the region segment return 404.)
>
> All OAuth, tools, and resources now live in
> `packages/backend/convex/mcp/`. This folder is kept only to support the
> production cutover; it will be deleted in a follow-up PR after prod soak.

Auth-first MCP server for connector onboarding in Claude/ChatGPT. It handles OAuth 2.0 + PKCE with Clerk and exposes basic MCP tools to confirm authenticated sessions.

Memory storage tools are intentionally not wired yet.

## Local Setup

```bash
# from repo root
pnpm install
pnpm --filter mcp dev
```

Or from `apps/mcp`:

```bash
pnpm install
pnpm dev
```

## Required Environment Variables

| Variable                | Required   | Description                                                                       |
| ----------------------- | ---------- | --------------------------------------------------------------------------------- |
| `MCP_JWT_SECRET`        | Yes        | Secret used to sign MCP JWT tokens. Example: `openssl rand -hex 32`               |
| `CLERK_PUBLISHABLE_KEY` | Yes        | Clerk publishable key (same value as web app `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`) |
| `CLERK_SECRET_KEY`      | Yes        | Clerk secret key for server-side token verification                               |
| `BASE_URL`              | Production | Public base URL of this service. Defaults to `http://localhost:PORT`              |
| `PORT`                  | No         | Server port. Defaults to `3001`                                                   |

## Build and Run

```bash
pnpm --filter mcp build
pnpm --filter mcp start
```

## Deploy to Railway

1. Create a Railway project pointing at this repository.
2. Set root directory to `apps/mcp`.
3. Build command: `pnpm install && pnpm build`
4. Start command: `node dist/index.js`
5. Add all required environment variables.
6. Deploy.

## Authentication Model

The server uses OAuth 2.0 with PKCE, with Clerk as identity provider.

### Flow

1. Connector discovers OAuth metadata at `/.well-known/oauth-authorization-server`.
2. Connector redirects user to `GET /oauth/authorize`.
3. Server renders Clerk sign-in.
4. User signs in.
5. Browser posts Clerk session token to `POST /oauth/authorize`.
6. Server verifies Clerk token and issues an authorization code.
7. Connector exchanges code at `POST /oauth/token` (PKCE + `client_id` checked).
8. Connector calls `POST /mcp` with Bearer token.
9. Server verifies JWT and handles MCP tool requests.

## MCP Tools (MVP)

| Tool                    | Description                                                 |
| ----------------------- | ----------------------------------------------------------- |
| `ping`                  | Health check for MCP session                                |
| `whoami`                | Returns authenticated Clerk user ID                         |
| `memory_backend_status` | Returns `not_implemented` until memory backend is connected |

## Connecting from Claude

1. Open Claude and go to `Settings > Connectors`.
2. Add connector URL: `https://your-domain/mcp`
3. Complete Clerk sign-in.
4. Use `whoami` to verify auth success.

## Endpoints

| Method | Path                                      | Purpose                                 |
| ------ | ----------------------------------------- | --------------------------------------- |
| GET    | `/.well-known/oauth-authorization-server` | OAuth discovery metadata                |
| GET    | `/.well-known/oauth-protected-resource`   | Protected resource metadata             |
| POST   | `/oauth/register`                         | Dynamic client registration             |
| GET    | `/oauth/authorize`                        | Render Clerk sign-in page               |
| POST   | `/oauth/authorize`                        | Verify Clerk token and return auth code |
| POST   | `/oauth/token`                            | Exchange auth code for JWT (PKCE)       |
| POST   | `/mcp` (or `/`)                           | MCP Streamable HTTP endpoint            |
| GET    | `/health`                                 | Health check                            |
