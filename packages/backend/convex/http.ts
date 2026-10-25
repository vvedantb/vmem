import { httpRouter } from "convex/server";
import { registerMcpRoutes } from "@vvedantb/server";
import { connectorCallback } from "./http/auth/connectorCallback";
import { clerkWebhook } from "./http/clerk/webhook";
import { deleteMemory } from "./http/v1Memories/delete";
import { retrieveMemories } from "./http/v1Memories/retrieve";
import { storeMemory } from "./http/v1Memories/store";
import { updateMemory } from "./http/v1Memories/update";
import {
  oauthMetadata,
  protectedResourceMetadata,
  protectedResourceMetadataTeam,
  mcpHandler,
  mcpTeamHandler,
  health as mcpHealth,
} from "./mcp/native";

const http = httpRouter();

http.route({
  path: "/api/auth/connector/callback",
  method: "GET",
  handler: connectorCallback,
});

http.route({
  path: "/clerk/webhooks",
  method: "POST",
  handler: clerkWebhook,
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

registerMcpRoutes(http, {
  authorizationServerMetadata: oauthMetadata,
  protectedResourceMetadata,
  endpoints: [
    { handler: mcpHandler },
    {
      path: "/mcp/team",
      handler: mcpTeamHandler,
      protectedResourceMetadata: protectedResourceMetadataTeam,
    },
  ],
  health: { handler: mcpHealth },
});

export default http;
