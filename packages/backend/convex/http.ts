import { httpRouter } from "convex/server";
import { connectorCallback } from "./http/auth/connectorCallback";
import { githubCallback } from "./http/auth/githubCallback";
import { deleteMemory } from "./http/v1Memories/delete";
import { retrieveMemories } from "./http/v1Memories/retrieve";
import { storeMemory } from "./http/v1Memories/store";
import { updateMemory } from "./http/v1Memories/update";
import {
  oauthMetadata,
  protectedResourceMetadata,
  protectedResourceMetadataTeam,
  register as mcpRegister,
  authorizeGet as mcpAuthorizeGet,
  token as mcpToken,
  mcpHandler,
  mcpTeamHandler,
  health as mcpHealth,
} from "./mcp/native";

const http = httpRouter();

http.route({
  path: "/api/auth/github/callback",
  method: "GET",
  handler: githubCallback,
});

http.route({
  path: "/api/auth/connector/callback",
  method: "GET",
  handler: connectorCallback,
});

http.route({
  path: "/api/v1/memories",
  method: "POST",
  handler: storeMemory,
});

http.route({
  path: "/api/v1/memories/retrieve",
  method: "POST",
  handler: retrieveMemories,
});

http.route({
  path: "/api/v1/memories",
  method: "PATCH",
  handler: updateMemory,
});

http.route({
  path: "/api/v1/memories",
  method: "DELETE",
  handler: deleteMemory,
});

http.route({
  path: "/.well-known/oauth-authorization-server",
  method: "GET",
  handler: oauthMetadata,
});

http.route({
  path: "/.well-known/oauth-protected-resource",
  method: "GET",
  handler: protectedResourceMetadata,
});

http.route({
  path: "/.well-known/oauth-protected-resource/mcp/team",
  method: "GET",
  handler: protectedResourceMetadataTeam,
});

http.route({
  path: "/mcp/oauth/register",
  method: "POST",
  handler: mcpRegister,
});

http.route({
  path: "/mcp/oauth/authorize",
  method: "GET",
  handler: mcpAuthorizeGet,
});

http.route({
  path: "/mcp/oauth/token",
  method: "POST",
  handler: mcpToken,
});

http.route({
  path: "/mcp",
  method: "POST",
  handler: mcpHandler,
});

http.route({
  path: "/mcp",
  method: "GET",
  handler: mcpHandler,
});

http.route({
  path: "/mcp",
  method: "DELETE",
  handler: mcpHandler,
});

http.route({
  path: "/mcp/team",
  method: "POST",
  handler: mcpTeamHandler,
});

http.route({
  path: "/mcp/team",
  method: "GET",
  handler: mcpTeamHandler,
});

http.route({
  path: "/mcp/team",
  method: "DELETE",
  handler: mcpTeamHandler,
});

http.route({
  path: "/health",
  method: "GET",
  handler: mcpHealth,
});

export default http;
