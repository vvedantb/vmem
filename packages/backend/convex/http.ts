import { httpRouter } from "convex/server";
import { connectorCallback } from "./http/auth/connectorCallback";
import { githubCallback } from "./http/auth/githubCallback";
import { storeMemory, retrieveMemories, updateMemory } from "./http/v1Memories";
import {
  oauthMetadata,
  protectedResourceMetadata,
  register as mcpRegister,
  authorizeGet as mcpAuthorizeGet,
  token as mcpToken,
  mcpHandler,
  health as mcpHealth,
  faviconPng as mcpFaviconPng,
  faviconIco as mcpFaviconIco,
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
  path: "/health",
  method: "GET",
  handler: mcpHealth,
});

http.route({
  path: "/favicon.png",
  method: "GET",
  handler: mcpFaviconPng,
});

http.route({
  path: "/favicon.ico",
  method: "GET",
  handler: mcpFaviconIco,
});

export default http;
