<!-- AI-generated (Claude), prompt: "document convex function conventions for vmem" -->
<!-- Modified by me: added typecheck and auth helper notes -->

# Convex functions

All vmem backend logic lives here. See `packages/backend/README.md` for architecture and module overview.

## Conventions

- Protected functions use `authQuery`, `authMutation`, or `authAction` from `auth.ts` — never raw Convex builders for user-facing APIs
- Neo4j operations go through `internal.neo4jActions.*` Node actions — never call Neo4j directly from queries/mutations
- Table field definitions live in `validators.ts` as exported `xxxFields` objects, used in both `schema.ts` and return validators
- Never manually define interfaces for Convex documents — use `Doc<"tableName">`, `Id<"fieldName">`, `FunctionReturnType<typeof api.fn>`

## Typecheck

```bash
cd packages/backend && npx convex codegen --typecheck enable
```

Do not run `npx convex dev` or `npx convex deploy` from agent sessions — use codegen for typechecking only.

## Docs

Product app: [vmem-staging.vedantb.com](https://vmem-staging.vedantb.com).
