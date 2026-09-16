import { z } from "zod";

export const healthBodySchema = z.object({
  status: z.string(),
});

export const oauthProtectedResourceSchema = z.object({
  resource: z.string(),
  authorization_servers: z.array(z.string()),
  bearer_methods_supported: z.array(z.string()),
  resource_documentation: z.string(),
});

export const oauthAuthorizationServerSchema = z.object({
  issuer: z.string(),
  authorization_endpoint: z.string(),
  token_endpoint: z.string(),
  registration_endpoint: z.string().optional(),
  grant_types_supported: z.array(z.string()).optional(),
});

export const mcpHttpErrorSchema = z.object({
  error: z.string(),
});

export const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string(),
  params: z.unknown().optional(),
});

export const jsonRpcErrorSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  error: z.object({
    code: z.number(),
    message: z.string(),
  }),
});

const mcpTextContentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const mcpImageContentSchema = z.object({
  type: z.literal("image"),
  data: z.string(),
  mimeType: z.string(),
});

export const mcpToolContentSchema = z.object({
  content: z.array(z.union([mcpTextContentSchema, mcpImageContentSchema])),
  isError: z.boolean().optional(),
  structuredContent: z.unknown().optional(),
});

export const mcpToolListItemSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

export const mcpToolsListResultSchema = z.object({
  tools: z.array(mcpToolListItemSchema),
});

export const mcpInitializeResultSchema = z.object({
  protocolVersion: z.string(),
  serverInfo: z.object({
    name: z.string(),
    version: z.string(),
  }),
  capabilities: z.unknown(),
});

export const jsonRpcSuccessSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  result: z.unknown(),
});

export const toolsCallParamsSchema = z.object({
  name: z.string(),
  arguments: z.record(z.unknown()).optional(),
});

export const pingResultSchema = z.object({
  ok: z.boolean(),
  scope: z.enum(["personal", "team"]),
  timestamp: z.string(),
});

export const whoamiResultSchema = z.object({
  authenticated: z.literal(true),
  clerkUserId: z.string(),
  scope: z.enum(["personal", "team"]),
  activeProfile: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .nullable(),
  profiles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  ),
});

export const memoryIdResultSchema = z.object({
  id: z.string(),
  title: z.string(),
});

export const memoryListResultSchema = z.object({
  memories: z.array(z.object({ id: z.string(), title: z.string() })),
  total: z.number(),
});

export const deletedFlagSchema = z.object({
  deleted: z.boolean(),
});

export const wikiNodeResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(["folder", "document", "artifact"]),
});

export const wikiDeletedSchema = z.object({
  deletedCount: z.number(),
});

export const fileUploadResultSchema = z.object({
  path: z.string(),
  kind: z.literal("file"),
  mimeType: z.string(),
  size: z.number(),
});

export const fileDeleteResultSchema = z.object({
  path: z.string(),
  deletedCount: z.number(),
});

export const skillsIndexEntrySchema = z.object({
  name: z.string(),
  description: z.string(),
});

export const contextPromptResultSchema = z.object({
  content: z.string(),
});

export const memoryCandidateListSchema = z.array(
  z.object({ id: z.string(), title: z.string() }),
);

export const relatedMemoriesResultSchema = z.array(
  z.object({
    memory: z.object({ id: z.string() }),
    reason: z.string(),
  }),
);

export const profileListSchema = z.array(
  z.object({ id: z.string(), name: z.string() }),
);

export const profileResultSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const skillCreatedSchema = z.object({
  name: z.string(),
  description: z.string(),
});

export const skillFetchedSchema = z.object({
  name: z.string(),
  instructions: z.string(),
});

export const skillUpdatedSchema = z.object({
  name: z.string(),
  enabled: z.boolean(),
});

export const wikiSearchResultSchema = z.array(
  z.object({ id: z.string(), title: z.string() }),
);

export const fileListSchema = z.array(
  z.object({ path: z.string(), kind: z.string() }),
);

export const fileGetResultSchema = z.object({
  path: z.string(),
  text: z.string().optional(),
});

export type McpToolContent = z.infer<typeof mcpToolContentSchema>;
export type McpInitializeResult = z.infer<typeof mcpInitializeResultSchema>;
