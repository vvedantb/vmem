// Pins the HTTP route table: every path, method and handler.
import type { PublicHttpAction, RoutableMethod } from "convex/server";
import { describe, expect, it } from "vitest";
import http from "./http";
import { connectorCallback } from "./http/auth/connectorCallback";
import { clerkWebhook } from "./http/clerk/webhook";
import { deleteMemory } from "./http/v1Memories/delete";
import { retrieveMemories } from "./http/v1Memories/retrieve";
import { storeMemory } from "./http/v1Memories/store";
import { updateMemory } from "./http/v1Memories/update";
import {
  health,
  mcpHandler,
  mcpTeamHandler,
  oauthMetadata,
  protectedResourceMetadata,
  protectedResourceMetadataTeam,
} from "./mcp/native";

// getRoutes() sorts by path, then method.
const EXPECTED: Array<[string, RoutableMethod, PublicHttpAction]> = [
  ["/.well-known/oauth-authorization-server", "GET", oauthMetadata],
  ["/.well-known/oauth-protected-resource", "GET", protectedResourceMetadata],
  [
    "/.well-known/oauth-protected-resource/mcp/team",
    "GET",
    protectedResourceMetadataTeam,
  ],
  ["/api/auth/connector/callback", "GET", connectorCallback],
  ["/api/v1/memories", "DELETE", deleteMemory],
  ["/api/v1/memories", "PATCH", updateMemory],
  ["/api/v1/memories", "POST", storeMemory],
  ["/api/v1/memories/retrieve", "POST", retrieveMemories],
  ["/clerk/webhooks", "POST", clerkWebhook],
  ["/health", "GET", health],
  ["/mcp", "DELETE", mcpHandler],
  ["/mcp", "GET", mcpHandler],
  ["/mcp", "POST", mcpHandler],
  ["/mcp/team", "DELETE", mcpTeamHandler],
  ["/mcp/team", "GET", mcpTeamHandler],
  ["/mcp/team", "POST", mcpTeamHandler],
];

describe("http routes", () => {
  it("registers exactly the expected routes and handlers", () => {
    const routes = http.getRoutes();
    expect(routes.map(([path, method]) => [path, method])).toEqual(
      EXPECTED.map(([path, method]) => [path, method]),
    );
    expect(routes.map(([, , handler]) => handler)).toEqual(
      EXPECTED.map(([, , handler]) => handler),
    );
    routes.forEach(([, , handler], i) => {
      expect(handler).toBe(EXPECTED[i]?.[2]);
    });
  });

  it("resolves each route to its handler and nothing else", () => {
    for (const [path, method, handler] of EXPECTED) {
      expect(http.lookup(path, method)).toEqual([handler, method, path]);
    }
    expect(http.lookup("/mcp", "OPTIONS")).toBeNull();
    expect(http.lookup("/mcp/team", "OPTIONS")).toBeNull();
    expect(http.lookup("/health", "POST")).toBeNull();
    expect(
      http.lookup("/.well-known/oauth-authorization-server/mcp", "GET"),
    ).toBeNull();
    expect(
      http.lookup("/.well-known/oauth-protected-resource/mcp", "GET"),
    ).toBeNull();
    expect(http.lookup("/token", "POST")).toBeNull();
  });
});
