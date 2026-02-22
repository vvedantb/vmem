# vmem MCP Server

Remote MCP server that lets Claude query the vmem Convex backend. Users authenticate with Clerk (same account as the web app), then Claude can list tables, read documents, and run arbitrary read-only queries.

## Local Setup

```bash
# from repo root
pnpm install
pnpm --filter vmem-mcp dev
```

Or from `apps/mcp`:

```bash
pnpm install
pnpm dev
```

### Required Environment Variables

| Variable                | Required   | Description                                                                       |
| ----------------------- | ---------- | --------------------------------------------------------------------------------- |
| `MCP_JWT_SECRET`        | Yes        | Secret used to sign MCP JWT tokens. Example: `openssl rand -hex 32`               |
| `CLERK_PUBLISHABLE_KEY` | Yes        | Clerk publishable key (same value as web app `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`) |
| `CLERK_SECRET_KEY`      | Yes        | Clerk secret key for server-side token verification                               |
| `VMEM_CONVEX_URL`       | Yes        | Convex deployment URL (example: `https://your-project-123.convex.cloud`)          |
| `VMEM_DEPLOY_KEY`       | Yes        | Convex deploy key used by MCP tools (read-only key recommended)                   |
| `BASE_URL`              | Production | Public base URL of this service. Defaults to `http://localhost:PORT`              |
| `PORT`                  | No         | Server port. Defaults to `3001`                                                   |

## Build and Run

```bash
pnpm --filter vmem-mcp build
pnpm --filter vmem-mcp start
```

## Deploy to Railway

1. Create a Railway project pointing at this repository.
2. Set root directory to `apps/mcp`.
3. Build command: `pnpm install && pnpm build`
4. Start command: `node dist/index.js`
5. Add all required environment variables.
6. Deploy.

## Authentication Model

The server uses OAuth 2.0 with PKCE, with Clerk as the identity provider.

### Flow

1. Claude discovers OAuth metadata at `/.well-known/oauth-authorization-server`.
2. Claude redirects the user to `GET /oauth/authorize`.
3. The server renders the Clerk sign-in widget.
4. User signs in with their vmem account.
5. Browser posts Clerk session token to `POST /oauth/authorize`.
6. Server verifies Clerk token and issues a short-lived auth code.
7. Claude exchanges the code at `POST /oauth/token` (PKCE verified).
8. Claude calls `POST /mcp` with a Bearer token.
9. Server verifies JWT and executes tools against Convex.

### Token Details

- Access token: JWT signed with `MCP_JWT_SECRET`, payload includes `{ sub: clerkUserId }`, expires in 30 days.
- Refresh token: same format, expires in 90 days.
- Convex credentials are always loaded from `VMEM_CONVEX_URL` and `VMEM_DEPLOY_KEY`.
- No persistent token store is required; JWT validation is signature + expiry.

## Connecting from Claude

1. Open Claude and go to `Settings > Connectors`.
2. Add connector URL: `https://your-domain/mcp`
3. Complete Clerk sign-in.
4. Claude can now call MCP tools.

## MCP Tools

| Tool           | Description                                           |
| -------------- | ----------------------------------------------------- |
| `list_tables`  | List tables with declared schema and inferred shapes  |
| `query_table`  | Paginated table read with ordering and cursor support |
| `get_document` | Fetch one document by Convex document ID              |
| `count_table`  | Count total documents in a table                      |
| `run_query`    | Execute arbitrary read-only Convex query code         |

## Troubleshooting

- `Method not supported in stateless mode` when opening `/mcp` in a browser is expected. MCP endpoint expects POST requests from an MCP client.
- `Invalid or expired token` usually means JWT expiry or `MCP_JWT_SECRET` changed. Reconnect the Claude connector.
- Clerk sign-in not loading: verify `CLERK_PUBLISHABLE_KEY`.
- `Invalid Clerk token`: token expired before submit, or `CLERK_SECRET_KEY` mismatch.

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
