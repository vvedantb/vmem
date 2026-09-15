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
import type * as connectors_crud from "../connectors/crud.js";
import type * as connectors_googleDrive from "../connectors/googleDrive.js";
import type * as connectors_googleShared from "../connectors/googleShared.js";
import type * as connectors_notion from "../connectors/notion.js";
import type * as connectors_oauth from "../connectors/oauth.js";
import type * as connectors_providerSync from "../connectors/providerSync.js";
import type * as connectors_sync from "../connectors/sync.js";
import type * as connectors_syncActions from "../connectors/syncActions.js";
import type * as connectors_syncShared from "../connectors/syncShared.js";
import type * as connectors_syncWorkflow from "../connectors/syncWorkflow.js";
import type * as connectors_tokens from "../connectors/tokens.js";
import type * as contextPromptActions from "../contextPromptActions.js";
import type * as contextPromptApi from "../contextPromptApi.js";
import type * as contextPromptCache from "../contextPromptCache.js";
import type * as crons from "../crons.js";
import type * as dashboardApi from "../dashboardApi.js";
import type * as dreamMode from "../dreamMode.js";
import type * as dreamSchedule from "../dreamSchedule.js";
import type * as dreamTrigger from "../dreamTrigger.js";
import type * as fileImport from "../fileImport.js";
import type * as fileIndexing from "../fileIndexing.js";
import type * as files from "../files.js";
import type * as files_lib from "../files/lib.js";
import type * as graphApi from "../graphApi.js";
import type * as http from "../http.js";
import type * as http_auth_connectorCallback from "../http/auth/connectorCallback.js";
import type * as http_auth_connectorCallbackHtml from "../http/auth/connectorCallbackHtml.js";
import type * as http_v1Memories_apiKeyAuth from "../http/v1Memories/apiKeyAuth.js";
import type * as http_v1Memories_delete from "../http/v1Memories/delete.js";
import type * as http_v1Memories_retrieve from "../http/v1Memories/retrieve.js";
import type * as http_v1Memories_store from "../http/v1Memories/store.js";
import type * as http_v1Memories_types from "../http/v1Memories/types.js";
import type * as http_v1Memories_update from "../http/v1Memories/update.js";
import type * as lib_arcticOAuth from "../lib/arcticOAuth.js";
import type * as lib_base64 from "../lib/base64.js";
import type * as lib_bearerToken from "../lib/bearerToken.js";
import type * as lib_clerkUser from "../lib/clerkUser.js";
import type * as lib_connectorAccessToken from "../lib/connectorAccessToken.js";
import type * as lib_contextPromptInvalidate from "../lib/contextPromptInvalidate.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_dreamTriggerDecision from "../lib/dreamTriggerDecision.js";
import type * as lib_dreamTriggerInvalidate from "../lib/dreamTriggerInvalidate.js";
import type * as lib_envVars from "../lib/envVars.js";
import type * as lib_openRouter from "../lib/openRouter.js";
import type * as lib_openRouter_bestEffortEmbed from "../lib/openRouter/bestEffortEmbed.js";
import type * as lib_openRouter_chat from "../lib/openRouter/chat.js";
import type * as lib_openRouter_embedding from "../lib/openRouter/embedding.js";
import type * as lib_openRouter_jsonChat from "../lib/openRouter/jsonChat.js";
import type * as lib_openRouter_schemas from "../lib/openRouter/schemas.js";
import type * as lib_openRouter_shared from "../lib/openRouter/shared.js";
import type * as lib_runConnectorProviderSync from "../lib/runConnectorProviderSync.js";
import type * as lib_scopedTree from "../lib/scopedTree.js";
import type * as lib_versionSnapshot from "../lib/versionSnapshot.js";
import type * as lib_wikiContent from "../lib/wikiContent.js";
import type * as mcp_bundled_memoryGraphHtml from "../mcp/bundled/memoryGraphHtml.js";
import type * as mcp_content from "../mcp/content.js";
import type * as mcp_fileOps from "../mcp/fileOps.js";
import type * as mcp_graph from "../mcp/graph.js";
import type * as mcp_memoryGraphApp from "../mcp/memoryGraphApp.js";
import type * as mcp_memoryScope from "../mcp/memoryScope.js";
import type * as mcp_native from "../mcp/native.js";
import type * as mcp_nodeActions from "../mcp/nodeActions.js";
import type * as mcp_resources from "../mcp/resources.js";
import type * as mcp_toolCatalog from "../mcp/toolCatalog.js";
import type * as mcp_tools from "../mcp/tools.js";
import type * as mcp_toolsCore from "../mcp/toolsCore.js";
import type * as mcp_toolsFiles from "../mcp/toolsFiles.js";
import type * as mcp_toolsMemory from "../mcp/toolsMemory.js";
import type * as mcp_toolsSkills from "../mcp/toolsSkills.js";
import type * as mcp_toolsWiki from "../mcp/toolsWiki.js";
import type * as mcp_toolTypes from "../mcp/toolTypes.js";
import type * as mcp_wikiOps from "../mcp/wikiOps.js";
import type * as memoryApi from "../memoryApi.js";
import type * as memoryApi_routing from "../memoryApi/routing.js";
import type * as memoryApi_team from "../memoryApi/team.js";
import type * as memoryApi_types from "../memoryApi/types.js";
import type * as memoryApi_validators from "../memoryApi/validators.js";
import type * as memoryEvents from "../memoryEvents.js";
import type * as memoryRuntime from "../memoryRuntime.js";
import type * as memoryScope from "../memoryScope.js";
import type * as memoryStore_functions from "../memoryStore/functions.js";
import type * as memoryStore_helpers from "../memoryStore/helpers.js";
import type * as memoryStore_mappers from "../memoryStore/mappers.js";
import type * as notifications from "../notifications.js";
import type * as oauthState from "../oauthState.js";
import type * as openRouterAggregates from "../openRouterAggregates.js";
import type * as openRouterLogs from "../openRouterLogs.js";
import type * as profiles from "../profiles.js";
import type * as profiles_accessibleProfile from "../profiles/accessibleProfile.js";
import type * as profiles_handlers from "../profiles/handlers.js";
import type * as profiles_helpers from "../profiles/helpers.js";
import type * as profiles_lifecycle from "../profiles/lifecycle.js";
import type * as profiles_mcpAccess from "../profiles/mcpAccess.js";
import type * as prompts_systemSkillSeeds from "../prompts/systemSkillSeeds.js";
import type * as proposedUpdateApi from "../proposedUpdateApi.js";
import type * as relationshipApi from "../relationshipApi.js";
import type * as skills from "../skills.js";
import type * as skillVersions from "../skillVersions.js";
import type * as systemSkills from "../systemSkills.js";
import type * as teams from "../teams.js";
import type * as teams_auth from "../teams/auth.js";
import type * as teams_handlers from "../teams/handlers.js";
import type * as teams_lifecycle from "../teams/lifecycle.js";
import type * as teams_membership from "../teams/membership.js";
import type * as timelineApi from "../timelineApi.js";
import type * as userEnvVars from "../userEnvVars.js";
import type * as userEnvVarsActions from "../userEnvVarsActions.js";
import type * as users from "../users.js";
import type * as userSettings from "../userSettings.js";
import type * as validators from "../validators.js";
import type * as wiki from "../wiki.js";
import type * as wiki_path from "../wiki/path.js";
import type * as wikiVersions from "../wikiVersions.js";
import type * as workpools from "../workpools.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  apiKeys: typeof apiKeys;
  auditLog: typeof auditLog;
  auth: typeof auth;
  "connectors/crud": typeof connectors_crud;
  "connectors/googleDrive": typeof connectors_googleDrive;
  "connectors/googleShared": typeof connectors_googleShared;
  "connectors/notion": typeof connectors_notion;
  "connectors/oauth": typeof connectors_oauth;
  "connectors/providerSync": typeof connectors_providerSync;
  "connectors/sync": typeof connectors_sync;
  "connectors/syncActions": typeof connectors_syncActions;
  "connectors/syncShared": typeof connectors_syncShared;
  "connectors/syncWorkflow": typeof connectors_syncWorkflow;
  "connectors/tokens": typeof connectors_tokens;
  contextPromptActions: typeof contextPromptActions;
  contextPromptApi: typeof contextPromptApi;
  contextPromptCache: typeof contextPromptCache;
  crons: typeof crons;
  dashboardApi: typeof dashboardApi;
  dreamMode: typeof dreamMode;
  dreamSchedule: typeof dreamSchedule;
  dreamTrigger: typeof dreamTrigger;
  fileImport: typeof fileImport;
  fileIndexing: typeof fileIndexing;
  files: typeof files;
  "files/lib": typeof files_lib;
  graphApi: typeof graphApi;
  http: typeof http;
  "http/auth/connectorCallback": typeof http_auth_connectorCallback;
  "http/auth/connectorCallbackHtml": typeof http_auth_connectorCallbackHtml;
  "http/v1Memories/apiKeyAuth": typeof http_v1Memories_apiKeyAuth;
  "http/v1Memories/delete": typeof http_v1Memories_delete;
  "http/v1Memories/retrieve": typeof http_v1Memories_retrieve;
  "http/v1Memories/store": typeof http_v1Memories_store;
  "http/v1Memories/types": typeof http_v1Memories_types;
  "http/v1Memories/update": typeof http_v1Memories_update;
  "lib/arcticOAuth": typeof lib_arcticOAuth;
  "lib/base64": typeof lib_base64;
  "lib/bearerToken": typeof lib_bearerToken;
  "lib/clerkUser": typeof lib_clerkUser;
  "lib/connectorAccessToken": typeof lib_connectorAccessToken;
  "lib/contextPromptInvalidate": typeof lib_contextPromptInvalidate;
  "lib/crypto": typeof lib_crypto;
  "lib/dreamTriggerDecision": typeof lib_dreamTriggerDecision;
  "lib/dreamTriggerInvalidate": typeof lib_dreamTriggerInvalidate;
  "lib/envVars": typeof lib_envVars;
  "lib/openRouter": typeof lib_openRouter;
  "lib/openRouter/bestEffortEmbed": typeof lib_openRouter_bestEffortEmbed;
  "lib/openRouter/chat": typeof lib_openRouter_chat;
  "lib/openRouter/embedding": typeof lib_openRouter_embedding;
  "lib/openRouter/jsonChat": typeof lib_openRouter_jsonChat;
  "lib/openRouter/schemas": typeof lib_openRouter_schemas;
  "lib/openRouter/shared": typeof lib_openRouter_shared;
  "lib/runConnectorProviderSync": typeof lib_runConnectorProviderSync;
  "lib/scopedTree": typeof lib_scopedTree;
  "lib/versionSnapshot": typeof lib_versionSnapshot;
  "lib/wikiContent": typeof lib_wikiContent;
  "mcp/bundled/memoryGraphHtml": typeof mcp_bundled_memoryGraphHtml;
  "mcp/content": typeof mcp_content;
  "mcp/fileOps": typeof mcp_fileOps;
  "mcp/graph": typeof mcp_graph;
  "mcp/memoryGraphApp": typeof mcp_memoryGraphApp;
  "mcp/memoryScope": typeof mcp_memoryScope;
  "mcp/native": typeof mcp_native;
  "mcp/nodeActions": typeof mcp_nodeActions;
  "mcp/resources": typeof mcp_resources;
  "mcp/toolCatalog": typeof mcp_toolCatalog;
  "mcp/tools": typeof mcp_tools;
  "mcp/toolsCore": typeof mcp_toolsCore;
  "mcp/toolsFiles": typeof mcp_toolsFiles;
  "mcp/toolsMemory": typeof mcp_toolsMemory;
  "mcp/toolsSkills": typeof mcp_toolsSkills;
  "mcp/toolsWiki": typeof mcp_toolsWiki;
  "mcp/toolTypes": typeof mcp_toolTypes;
  "mcp/wikiOps": typeof mcp_wikiOps;
  memoryApi: typeof memoryApi;
  "memoryApi/routing": typeof memoryApi_routing;
  "memoryApi/team": typeof memoryApi_team;
  "memoryApi/types": typeof memoryApi_types;
  "memoryApi/validators": typeof memoryApi_validators;
  memoryEvents: typeof memoryEvents;
  memoryRuntime: typeof memoryRuntime;
  memoryScope: typeof memoryScope;
  "memoryStore/functions": typeof memoryStore_functions;
  "memoryStore/helpers": typeof memoryStore_helpers;
  "memoryStore/mappers": typeof memoryStore_mappers;
  notifications: typeof notifications;
  oauthState: typeof oauthState;
  openRouterAggregates: typeof openRouterAggregates;
  openRouterLogs: typeof openRouterLogs;
  profiles: typeof profiles;
  "profiles/accessibleProfile": typeof profiles_accessibleProfile;
  "profiles/handlers": typeof profiles_handlers;
  "profiles/helpers": typeof profiles_helpers;
  "profiles/lifecycle": typeof profiles_lifecycle;
  "profiles/mcpAccess": typeof profiles_mcpAccess;
  "prompts/systemSkillSeeds": typeof prompts_systemSkillSeeds;
  proposedUpdateApi: typeof proposedUpdateApi;
  relationshipApi: typeof relationshipApi;
  skills: typeof skills;
  skillVersions: typeof skillVersions;
  systemSkills: typeof systemSkills;
  teams: typeof teams;
  "teams/auth": typeof teams_auth;
  "teams/handlers": typeof teams_handlers;
  "teams/lifecycle": typeof teams_lifecycle;
  "teams/membership": typeof teams_membership;
  timelineApi: typeof timelineApi;
  userEnvVars: typeof userEnvVars;
  userEnvVarsActions: typeof userEnvVarsActions;
  users: typeof users;
  userSettings: typeof userSettings;
  validators: typeof validators;
  wiki: typeof wiki;
  "wiki/path": typeof wiki_path;
  wikiVersions: typeof wikiVersions;
  workpools: typeof workpools;
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
  actionCache: import("@convex-dev/action-cache/_generated/component.js").ComponentApi<"actionCache">;
  crons: import("@convex-dev/crons/_generated/component.js").ComponentApi<"crons">;
  connectorSyncPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"connectorSyncPool">;
  auditLog: import("convex-audit-log/_generated/component.js").ComponentApi<"auditLog">;
  openRouterLogCost: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"openRouterLogCost">;
  openRouterLogTokens: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"openRouterLogTokens">;
  openRouterModels: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"openRouterModels">;
};
