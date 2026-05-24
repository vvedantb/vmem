/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as apiKeys from "../apiKeys.js";
import type * as auditLog from "../auditLog.js";
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as codebaseSymbols from "../codebaseSymbols.js";
import type * as codebaseSync from "../codebaseSync.js";
import type * as codebaseSyncActions from "../codebaseSyncActions.js";
import type * as codebaseSyncConstants from "../codebaseSyncConstants.js";
import type * as codebases from "../codebases.js";
import type * as connectorData from "../connectorData.js";
import type * as connectorOAuth from "../connectorOAuth.js";
import type * as connectorSync from "../connectorSync.js";
import type * as connectorSyncActions from "../connectorSyncActions.js";
import type * as connectorSyncWorkflow from "../connectorSyncWorkflow.js";
import type * as connectorTokens from "../connectorTokens.js";
import type * as connectors from "../connectors.js";
import type * as contextPromptActions from "../contextPromptActions.js";
import type * as contextPromptApi from "../contextPromptApi.js";
import type * as contextPromptCache from "../contextPromptCache.js";
import type * as crons from "../crons.js";
import type * as dashboardApi from "../dashboardApi.js";
import type * as dreamMode from "../dreamMode.js";
import type * as dreamSchedule from "../dreamSchedule.js";
import type * as fileImport from "../fileImport.js";
import type * as github from "../github.js";
import type * as graphApi from "../graphApi.js";
import type * as http from "../http.js";
import type * as http_auth_connectorCallback from "../http/auth/connectorCallback.js";
import type * as http_auth_connectorCallbackHtml from "../http/auth/connectorCallbackHtml.js";
import type * as http_auth_githubCallback from "../http/auth/githubCallback.js";
import type * as http_v1Memories_apiKeyAuth from "../http/v1Memories/apiKeyAuth.js";
import type * as http_v1Memories_index from "../http/v1Memories/index.js";
import type * as http_v1Memories_retrieve from "../http/v1Memories/retrieve.js";
import type * as http_v1Memories_schemas from "../http/v1Memories/schemas.js";
import type * as http_v1Memories_store from "../http/v1Memories/store.js";
import type * as http_v1Memories_types from "../http/v1Memories/types.js";
import type * as http_v1Memories_update from "../http/v1Memories/update.js";
import type * as lib_bearerToken from "../lib/bearerToken.js";
import type * as lib_connectorAccessToken from "../lib/connectorAccessToken.js";
import type * as lib_contextPromptInvalidate from "../lib/contextPromptInvalidate.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_envVars from "../lib/envVars.js";
import type * as lib_openRouter from "../lib/openRouter.js";
import type * as lib_openRouter_bestEffortEmbed from "../lib/openRouter/bestEffortEmbed.js";
import type * as lib_openRouter_chat from "../lib/openRouter/chat.js";
import type * as lib_openRouter_embedding from "../lib/openRouter/embedding.js";
import type * as lib_openRouter_shared from "../lib/openRouter/shared.js";
import type * as lib_runConnectorProviderSync from "../lib/runConnectorProviderSync.js";
import type * as lib_wikiContent from "../lib/wikiContent.js";
import type * as mcpCodebases from "../mcpCodebases.js";
import type * as mcpProfiles from "../mcpProfiles.js";
import type * as mcpSkills from "../mcpSkills.js";
import type * as mcpWiki from "../mcpWiki.js";
import type * as mcp_native from "../mcp/native.js";
import type * as mcp_nodeActions from "../mcp/nodeActions.js";
import type * as mcp_oauth from "../mcp/oauth.js";
import type * as mcp_resources from "../mcp/resources.js";
import type * as mcp_tools from "../mcp/tools.js";
import type * as memoryApi from "../memoryApi.js";
import type * as memoryApi_auth from "../memoryApi/auth.js";
import type * as memoryApi_personal from "../memoryApi/personal.js";
import type * as memoryApi_team from "../memoryApi/team.js";
import type * as memoryApi_types from "../memoryApi/types.js";
import type * as memoryEvents from "../memoryEvents.js";
import type * as neo4jActions_agent from "../neo4jActions/agent.js";
import type * as neo4jActions_agent_shared from "../neo4jActions/agent/shared.js";
import type * as neo4jActions_agent_storeFromInstruction from "../neo4jActions/agent/storeFromInstruction.js";
import type * as neo4jActions_agent_summarizeRetrieve from "../neo4jActions/agent/summarizeRetrieve.js";
import type * as neo4jActions_agent_updateFromInstruction from "../neo4jActions/agent/updateFromInstruction.js";
import type * as neo4jActions_codebases from "../neo4jActions/codebases.js";
import type * as neo4jActions_connectorData from "../neo4jActions/connectorData.js";
import type * as neo4jActions_connectorSync from "../neo4jActions/connectorSync.js";
import type * as neo4jActions_connectors_gmail from "../neo4jActions/connectors/gmail.js";
import type * as neo4jActions_connectors_googleDrive from "../neo4jActions/connectors/googleDrive.js";
import type * as neo4jActions_connectors_googleShared from "../neo4jActions/connectors/googleShared.js";
import type * as neo4jActions_connectors_linear from "../neo4jActions/connectors/linear.js";
import type * as neo4jActions_connectors_notion from "../neo4jActions/connectors/notion.js";
import type * as neo4jActions_connectors_oneDrive from "../neo4jActions/connectors/oneDrive.js";
import type * as neo4jActions_connectors_shared from "../neo4jActions/connectors/shared.js";
import type * as neo4jActions_dashboard from "../neo4jActions/dashboard.js";
import type * as neo4jActions_dbSetup from "../neo4jActions/dbSetup.js";
import type * as neo4jActions_dreamMode from "../neo4jActions/dreamMode.js";
import type * as neo4jActions_dreamMode_entryPoints from "../neo4jActions/dreamMode/entryPoints.js";
import type * as neo4jActions_dreamMode_runProfile from "../neo4jActions/dreamMode/runProfile.js";
import type * as neo4jActions_enrichment from "../neo4jActions/enrichment.js";
import type * as neo4jActions_factExtraction from "../neo4jActions/factExtraction.js";
import type * as neo4jActions_graph from "../neo4jActions/graph.js";
import type * as neo4jActions_mcp from "../neo4jActions/mcp.js";
import type * as neo4jActions_memories from "../neo4jActions/memories.js";
import type * as neo4jActions_memories_chunks from "../neo4jActions/memories/chunks.js";
import type * as neo4jActions_memories_create from "../neo4jActions/memories/create.js";
import type * as neo4jActions_memories_delete from "../neo4jActions/memories/delete.js";
import type * as neo4jActions_memories_read from "../neo4jActions/memories/read.js";
import type * as neo4jActions_memories_shared from "../neo4jActions/memories/shared.js";
import type * as neo4jActions_memories_team from "../neo4jActions/memories/team.js";
import type * as neo4jActions_memories_update from "../neo4jActions/memories/update.js";
import type * as neo4jActions_migration from "../neo4jActions/migration.js";
import type * as neo4jActions_migration_backfill from "../neo4jActions/migration/backfill.js";
import type * as neo4jActions_migration_dedup from "../neo4jActions/migration/dedup.js";
import type * as neo4jActions_migration_profiles from "../neo4jActions/migration/profiles.js";
import type * as neo4jActions_proposedUpdates from "../neo4jActions/proposedUpdates.js";
import type * as neo4jActions_relationships from "../neo4jActions/relationships.js";
import type * as neo4jActions_timeline from "../neo4jActions/timeline.js";
import type * as notifications from "../notifications.js";
import type * as oauthState from "../oauthState.js";
import type * as openRouterLogs from "../openRouterLogs.js";
import type * as profiles from "../profiles.js";
import type * as profiles_dream from "../profiles/dream.js";
import type * as profiles_handlers from "../profiles/handlers.js";
import type * as profiles_helpers from "../profiles/helpers.js";
import type * as profiles_lifecycle from "../profiles/lifecycle.js";
import type * as proposedUpdateApi from "../proposedUpdateApi.js";
import type * as relationshipApi from "../relationshipApi.js";
import type * as retrier from "../retrier.js";
import type * as skills from "../skills.js";
import type * as teams from "../teams.js";
import type * as teams_auth from "../teams/auth.js";
import type * as teams_handlers from "../teams/handlers.js";
import type * as teams_lifecycle from "../teams/lifecycle.js";
import type * as teams_membership from "../teams/membership.js";
import type * as timelineApi from "../timelineApi.js";
import type * as userEnvVars from "../userEnvVars.js";
import type * as userEnvVarsActions from "../userEnvVarsActions.js";
import type * as userSettings from "../userSettings.js";
import type * as users from "../users.js";
import type * as validators from "../validators.js";
import type * as wiki from "../wiki.js";
import type * as workflow from "../workflow.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  apiKeys: typeof apiKeys;
  auditLog: typeof auditLog;
  auth: typeof auth;
  chat: typeof chat;
  codebaseSymbols: typeof codebaseSymbols;
  codebaseSync: typeof codebaseSync;
  codebaseSyncActions: typeof codebaseSyncActions;
  codebaseSyncConstants: typeof codebaseSyncConstants;
  codebases: typeof codebases;
  connectorData: typeof connectorData;
  connectorOAuth: typeof connectorOAuth;
  connectorSync: typeof connectorSync;
  connectorSyncActions: typeof connectorSyncActions;
  connectorSyncWorkflow: typeof connectorSyncWorkflow;
  connectorTokens: typeof connectorTokens;
  connectors: typeof connectors;
  contextPromptActions: typeof contextPromptActions;
  contextPromptApi: typeof contextPromptApi;
  contextPromptCache: typeof contextPromptCache;
  crons: typeof crons;
  dashboardApi: typeof dashboardApi;
  dreamMode: typeof dreamMode;
  dreamSchedule: typeof dreamSchedule;
  fileImport: typeof fileImport;
  github: typeof github;
  graphApi: typeof graphApi;
  http: typeof http;
  "http/auth/connectorCallback": typeof http_auth_connectorCallback;
  "http/auth/connectorCallbackHtml": typeof http_auth_connectorCallbackHtml;
  "http/auth/githubCallback": typeof http_auth_githubCallback;
  "http/v1Memories/apiKeyAuth": typeof http_v1Memories_apiKeyAuth;
  "http/v1Memories/index": typeof http_v1Memories_index;
  "http/v1Memories/retrieve": typeof http_v1Memories_retrieve;
  "http/v1Memories/schemas": typeof http_v1Memories_schemas;
  "http/v1Memories/store": typeof http_v1Memories_store;
  "http/v1Memories/types": typeof http_v1Memories_types;
  "http/v1Memories/update": typeof http_v1Memories_update;
  "lib/bearerToken": typeof lib_bearerToken;
  "lib/connectorAccessToken": typeof lib_connectorAccessToken;
  "lib/contextPromptInvalidate": typeof lib_contextPromptInvalidate;
  "lib/crypto": typeof lib_crypto;
  "lib/envVars": typeof lib_envVars;
  "lib/openRouter": typeof lib_openRouter;
  "lib/openRouter/bestEffortEmbed": typeof lib_openRouter_bestEffortEmbed;
  "lib/openRouter/chat": typeof lib_openRouter_chat;
  "lib/openRouter/embedding": typeof lib_openRouter_embedding;
  "lib/openRouter/shared": typeof lib_openRouter_shared;
  "lib/runConnectorProviderSync": typeof lib_runConnectorProviderSync;
  "lib/wikiContent": typeof lib_wikiContent;
  mcpCodebases: typeof mcpCodebases;
  mcpProfiles: typeof mcpProfiles;
  mcpSkills: typeof mcpSkills;
  mcpWiki: typeof mcpWiki;
  "mcp/native": typeof mcp_native;
  "mcp/nodeActions": typeof mcp_nodeActions;
  "mcp/oauth": typeof mcp_oauth;
  "mcp/resources": typeof mcp_resources;
  "mcp/tools": typeof mcp_tools;
  memoryApi: typeof memoryApi;
  "memoryApi/auth": typeof memoryApi_auth;
  "memoryApi/personal": typeof memoryApi_personal;
  "memoryApi/team": typeof memoryApi_team;
  "memoryApi/types": typeof memoryApi_types;
  memoryEvents: typeof memoryEvents;
  "neo4jActions/agent": typeof neo4jActions_agent;
  "neo4jActions/agent/shared": typeof neo4jActions_agent_shared;
  "neo4jActions/agent/storeFromInstruction": typeof neo4jActions_agent_storeFromInstruction;
  "neo4jActions/agent/summarizeRetrieve": typeof neo4jActions_agent_summarizeRetrieve;
  "neo4jActions/agent/updateFromInstruction": typeof neo4jActions_agent_updateFromInstruction;
  "neo4jActions/codebases": typeof neo4jActions_codebases;
  "neo4jActions/connectorData": typeof neo4jActions_connectorData;
  "neo4jActions/connectorSync": typeof neo4jActions_connectorSync;
  "neo4jActions/connectors/gmail": typeof neo4jActions_connectors_gmail;
  "neo4jActions/connectors/googleDrive": typeof neo4jActions_connectors_googleDrive;
  "neo4jActions/connectors/googleShared": typeof neo4jActions_connectors_googleShared;
  "neo4jActions/connectors/linear": typeof neo4jActions_connectors_linear;
  "neo4jActions/connectors/notion": typeof neo4jActions_connectors_notion;
  "neo4jActions/connectors/oneDrive": typeof neo4jActions_connectors_oneDrive;
  "neo4jActions/connectors/shared": typeof neo4jActions_connectors_shared;
  "neo4jActions/dashboard": typeof neo4jActions_dashboard;
  "neo4jActions/dbSetup": typeof neo4jActions_dbSetup;
  "neo4jActions/dreamMode": typeof neo4jActions_dreamMode;
  "neo4jActions/dreamMode/entryPoints": typeof neo4jActions_dreamMode_entryPoints;
  "neo4jActions/dreamMode/runProfile": typeof neo4jActions_dreamMode_runProfile;
  "neo4jActions/enrichment": typeof neo4jActions_enrichment;
  "neo4jActions/factExtraction": typeof neo4jActions_factExtraction;
  "neo4jActions/graph": typeof neo4jActions_graph;
  "neo4jActions/mcp": typeof neo4jActions_mcp;
  "neo4jActions/memories": typeof neo4jActions_memories;
  "neo4jActions/memories/chunks": typeof neo4jActions_memories_chunks;
  "neo4jActions/memories/create": typeof neo4jActions_memories_create;
  "neo4jActions/memories/delete": typeof neo4jActions_memories_delete;
  "neo4jActions/memories/read": typeof neo4jActions_memories_read;
  "neo4jActions/memories/shared": typeof neo4jActions_memories_shared;
  "neo4jActions/memories/team": typeof neo4jActions_memories_team;
  "neo4jActions/memories/update": typeof neo4jActions_memories_update;
  "neo4jActions/migration": typeof neo4jActions_migration;
  "neo4jActions/migration/backfill": typeof neo4jActions_migration_backfill;
  "neo4jActions/migration/dedup": typeof neo4jActions_migration_dedup;
  "neo4jActions/migration/profiles": typeof neo4jActions_migration_profiles;
  "neo4jActions/proposedUpdates": typeof neo4jActions_proposedUpdates;
  "neo4jActions/relationships": typeof neo4jActions_relationships;
  "neo4jActions/timeline": typeof neo4jActions_timeline;
  notifications: typeof notifications;
  oauthState: typeof oauthState;
  openRouterLogs: typeof openRouterLogs;
  profiles: typeof profiles;
  "profiles/dream": typeof profiles_dream;
  "profiles/handlers": typeof profiles_handlers;
  "profiles/helpers": typeof profiles_helpers;
  "profiles/lifecycle": typeof profiles_lifecycle;
  proposedUpdateApi: typeof proposedUpdateApi;
  relationshipApi: typeof relationshipApi;
  retrier: typeof retrier;
  skills: typeof skills;
  teams: typeof teams;
  "teams/auth": typeof teams_auth;
  "teams/handlers": typeof teams_handlers;
  "teams/lifecycle": typeof teams_lifecycle;
  "teams/membership": typeof teams_membership;
  timelineApi: typeof timelineApi;
  userEnvVars: typeof userEnvVars;
  userEnvVarsActions: typeof userEnvVarsActions;
  userSettings: typeof userSettings;
  users: typeof users;
  validators: typeof validators;
  wiki: typeof wiki;
  workflow: typeof workflow;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  actionRetrier: import("@convex-dev/action-retrier/_generated/component.js").ComponentApi<"actionRetrier">;
  actionCache: import("@convex-dev/action-cache/_generated/component.js").ComponentApi<"actionCache">;
  crons: import("@convex-dev/crons/_generated/component.js").ComponentApi<"crons">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  auditLog: import("convex-audit-log/_generated/component.js").ComponentApi<"auditLog">;
};
