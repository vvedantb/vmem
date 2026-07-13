/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as apiKeys from "../apiKeys.js";
import type * as auditLog from "../auditLog.js";
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as chatStreamActions from "../chatStreamActions.js";
import type * as cloudLib_cloudMemoryRef from "../cloudLib/cloudMemoryRef.js";
import type * as cloudLib_openRouterTools from "../cloudLib/openRouterTools.js";
import type * as codebaseSymbols from "../codebaseSymbols.js";
import type * as codebaseSync from "../codebaseSync.js";
import type * as codebaseSyncActions from "../codebaseSyncActions.js";
import type * as codebaseSyncConstants from "../codebaseSyncConstants.js";
import type * as codebases from "../codebases.js";
import type * as connectors_crud from "../connectors/crud.js";
import type * as connectors_data from "../connectors/data.js";
import type * as connectors_oauth from "../connectors/oauth.js";
import type * as connectors_sync from "../connectors/sync.js";
import type * as connectors_syncActions from "../connectors/syncActions.js";
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
import type * as github from "../github.js";
import type * as graphApi from "../graphApi.js";
import type * as http from "../http.js";
import type * as http_auth_connectorCallback from "../http/auth/connectorCallback.js";
import type * as http_auth_connectorCallbackHtml from "../http/auth/connectorCallbackHtml.js";
import type * as http_auth_githubCallback from "../http/auth/githubCallback.js";
import type * as http_v1Memories_apiKeyAuth from "../http/v1Memories/apiKeyAuth.js";
import type * as http_v1Memories_delete from "../http/v1Memories/delete.js";
import type * as http_v1Memories_index from "../http/v1Memories/index.js";
import type * as http_v1Memories_retrieve from "../http/v1Memories/retrieve.js";
import type * as http_v1Memories_schemas from "../http/v1Memories/schemas.js";
import type * as http_v1Memories_store from "../http/v1Memories/store.js";
import type * as http_v1Memories_types from "../http/v1Memories/types.js";
import type * as http_v1Memories_update from "../http/v1Memories/update.js";
import type * as lib_bearerToken from "../lib/bearerToken.js";
import type * as lib_clerkUser from "../lib/clerkUser.js";
import type * as lib_connectorAccessToken from "../lib/connectorAccessToken.js";
import type * as lib_contextPromptInvalidate from "../lib/contextPromptInvalidate.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_dreamTriggerDecision from "../lib/dreamTriggerDecision.js";
import type * as lib_dreamTriggerInvalidate from "../lib/dreamTriggerInvalidate.js";
import type * as lib_envVars from "../lib/envVars.js";
import type * as lib_jsonBoundary from "../lib/jsonBoundary.js";
import type * as lib_openRouter from "../lib/openRouter.js";
import type * as lib_openRouter_bestEffortEmbed from "../lib/openRouter/bestEffortEmbed.js";
import type * as lib_openRouter_chat from "../lib/openRouter/chat.js";
import type * as lib_openRouter_client from "../lib/openRouter/client.js";
import type * as lib_openRouter_embedding from "../lib/openRouter/embedding.js";
import type * as lib_openRouter_jsonChat from "../lib/openRouter/jsonChat.js";
import type * as lib_openRouter_shared from "../lib/openRouter/shared.js";
import type * as lib_runConnectorProviderSync from "../lib/runConnectorProviderSync.js";
import type * as lib_scopedTree from "../lib/scopedTree.js";
import type * as lib_versionSnapshot from "../lib/versionSnapshot.js";
import type * as lib_wikiContent from "../lib/wikiContent.js";
import type * as mcp_bundled_memoryGraphHtml from "../mcp/bundled/memoryGraphHtml.js";
import type * as mcp_codebases from "../mcp/codebases.js";
import type * as mcp_files from "../mcp/files.js";
import type * as mcp_graph from "../mcp/graph.js";
import type * as mcp_memoryGraphApp from "../mcp/memoryGraphApp.js";
import type * as mcp_native from "../mcp/native.js";
import type * as mcp_nodeActions from "../mcp/nodeActions.js";
import type * as mcp_oauth from "../mcp/oauth.js";
import type * as mcp_profiles from "../mcp/profiles.js";
import type * as mcp_resources from "../mcp/resources.js";
import type * as mcp_schemas from "../mcp/schemas.js";
import type * as mcp_toolCatalog from "../mcp/toolCatalog.js";
import type * as mcp_toolHandlers from "../mcp/toolHandlers.js";
import type * as mcp_tools from "../mcp/tools.js";
import type * as mcp_wiki from "../mcp/wiki.js";
import type * as memoryApi from "../memoryApi.js";
import type * as memoryApi_auth from "../memoryApi/auth.js";
import type * as memoryApi_personal from "../memoryApi/personal.js";
import type * as memoryApi_team from "../memoryApi/team.js";
import type * as memoryApi_types from "../memoryApi/types.js";
import type * as memoryEvents from "../memoryEvents.js";
import type * as neo4jActions__memories_actions from "../neo4jActions/_memories/actions.js";
import type * as neo4jActions__memories_chunks from "../neo4jActions/_memories/chunks.js";
import type * as neo4jActions__memories_create from "../neo4jActions/_memories/create.js";
import type * as neo4jActions__memories_delete from "../neo4jActions/_memories/delete.js";
import type * as neo4jActions__memories_postMaterialize from "../neo4jActions/_memories/postMaterialize.js";
import type * as neo4jActions__memories_read from "../neo4jActions/_memories/read.js";
import type * as neo4jActions__memories_shared from "../neo4jActions/_memories/shared.js";
import type * as neo4jActions__memories_team from "../neo4jActions/_memories/team.js";
import type * as neo4jActions__memories_update from "../neo4jActions/_memories/update.js";
import type * as neo4jActions_agent from "../neo4jActions/agent.js";
import type * as neo4jActions_agent_applyFactDecision from "../neo4jActions/agent/applyFactDecision.js";
import type * as neo4jActions_agent_factDecisionLoop from "../neo4jActions/agent/factDecisionLoop.js";
import type * as neo4jActions_agent_shared from "../neo4jActions/agent/shared.js";
import type * as neo4jActions_agent_storeFromInstruction from "../neo4jActions/agent/storeFromInstruction.js";
import type * as neo4jActions_agent_summarizeRetrieve from "../neo4jActions/agent/summarizeRetrieve.js";
import type * as neo4jActions_agent_updateFromInstruction from "../neo4jActions/agent/updateFromInstruction.js";
import type * as neo4jActions_codebases from "../neo4jActions/codebases.js";
import type * as neo4jActions_connectorData from "../neo4jActions/connectorData.js";
import type * as neo4jActions_connectorSync from "../neo4jActions/connectorSync.js";
import type * as neo4jActions_connectors_googleDrive from "../neo4jActions/connectors/googleDrive.js";
import type * as neo4jActions_connectors_googleShared from "../neo4jActions/connectors/googleShared.js";
import type * as neo4jActions_connectors_notion from "../neo4jActions/connectors/notion.js";
import type * as neo4jActions_connectors_shared from "../neo4jActions/connectors/shared.js";
import type * as neo4jActions_dashboard from "../neo4jActions/dashboard.js";
import type * as neo4jActions_dbSetup from "../neo4jActions/dbSetup.js";
import type * as neo4jActions_dreamMode from "../neo4jActions/dreamMode.js";
import type * as neo4jActions_dreamMode_entryPoints from "../neo4jActions/dreamMode/entryPoints.js";
import type * as neo4jActions_dreamMode_runProfile from "../neo4jActions/dreamMode/runProfile.js";
import type * as neo4jActions_enrichment from "../neo4jActions/enrichment.js";
import type * as neo4jActions_enrichment_llm from "../neo4jActions/enrichment/llm.js";
import type * as neo4jActions_factExtraction from "../neo4jActions/factExtraction.js";
import type * as neo4jActions_graph from "../neo4jActions/graph.js";
import type * as neo4jActions_mcp from "../neo4jActions/mcp.js";
import type * as neo4jActions_memories from "../neo4jActions/memories.js";
import type * as neo4jActions_migration from "../neo4jActions/migration.js";
import type * as neo4jActions_migration_backfill from "../neo4jActions/migration/backfill.js";
import type * as neo4jActions_migration_dedup from "../neo4jActions/migration/dedup.js";
import type * as neo4jActions_migration_entityAliases from "../neo4jActions/migration/entityAliases.js";
import type * as neo4jActions_migration_profiles from "../neo4jActions/migration/profiles.js";
import type * as neo4jActions_migration_retag from "../neo4jActions/migration/retag.js";
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
import type * as profiles_mcpAccess from "../profiles/mcpAccess.js";
import type * as prompts_enrichmentPrompt from "../prompts/enrichmentPrompt.js";
import type * as prompts_sdkPrompt from "../prompts/sdkPrompt.js";
import type * as prompts_systemSkillSeeds from "../prompts/systemSkillSeeds.js";
import type * as prompts_v2Prompt from "../prompts/v2Prompt.js";
import type * as proposedUpdateApi from "../proposedUpdateApi.js";
import type * as relationshipApi from "../relationshipApi.js";
import type * as retrier from "../retrier.js";
import type * as skillVersions from "../skillVersions.js";
import type * as skills from "../skills.js";
import type * as systemSkills from "../systemSkills.js";
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
import type * as wikiVersions from "../wikiVersions.js";
import type * as wiki_path from "../wiki/path.js";
import type * as workflow from "../workflow.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  apiKeys: typeof apiKeys;
  auditLog: typeof auditLog;
  auth: typeof auth;
  chat: typeof chat;
  chatStreamActions: typeof chatStreamActions;
  "cloudLib/cloudMemoryRef": typeof cloudLib_cloudMemoryRef;
  "cloudLib/openRouterTools": typeof cloudLib_openRouterTools;
  codebaseSymbols: typeof codebaseSymbols;
  codebaseSync: typeof codebaseSync;
  codebaseSyncActions: typeof codebaseSyncActions;
  codebaseSyncConstants: typeof codebaseSyncConstants;
  codebases: typeof codebases;
  "connectors/crud": typeof connectors_crud;
  "connectors/data": typeof connectors_data;
  "connectors/oauth": typeof connectors_oauth;
  "connectors/sync": typeof connectors_sync;
  "connectors/syncActions": typeof connectors_syncActions;
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
  github: typeof github;
  graphApi: typeof graphApi;
  http: typeof http;
  "http/auth/connectorCallback": typeof http_auth_connectorCallback;
  "http/auth/connectorCallbackHtml": typeof http_auth_connectorCallbackHtml;
  "http/auth/githubCallback": typeof http_auth_githubCallback;
  "http/v1Memories/apiKeyAuth": typeof http_v1Memories_apiKeyAuth;
  "http/v1Memories/delete": typeof http_v1Memories_delete;
  "http/v1Memories/index": typeof http_v1Memories_index;
  "http/v1Memories/retrieve": typeof http_v1Memories_retrieve;
  "http/v1Memories/schemas": typeof http_v1Memories_schemas;
  "http/v1Memories/store": typeof http_v1Memories_store;
  "http/v1Memories/types": typeof http_v1Memories_types;
  "http/v1Memories/update": typeof http_v1Memories_update;
  "lib/bearerToken": typeof lib_bearerToken;
  "lib/clerkUser": typeof lib_clerkUser;
  "lib/connectorAccessToken": typeof lib_connectorAccessToken;
  "lib/contextPromptInvalidate": typeof lib_contextPromptInvalidate;
  "lib/crypto": typeof lib_crypto;
  "lib/dreamTriggerDecision": typeof lib_dreamTriggerDecision;
  "lib/dreamTriggerInvalidate": typeof lib_dreamTriggerInvalidate;
  "lib/envVars": typeof lib_envVars;
  "lib/jsonBoundary": typeof lib_jsonBoundary;
  "lib/openRouter": typeof lib_openRouter;
  "lib/openRouter/bestEffortEmbed": typeof lib_openRouter_bestEffortEmbed;
  "lib/openRouter/chat": typeof lib_openRouter_chat;
  "lib/openRouter/client": typeof lib_openRouter_client;
  "lib/openRouter/embedding": typeof lib_openRouter_embedding;
  "lib/openRouter/jsonChat": typeof lib_openRouter_jsonChat;
  "lib/openRouter/shared": typeof lib_openRouter_shared;
  "lib/runConnectorProviderSync": typeof lib_runConnectorProviderSync;
  "lib/scopedTree": typeof lib_scopedTree;
  "lib/versionSnapshot": typeof lib_versionSnapshot;
  "lib/wikiContent": typeof lib_wikiContent;
  "mcp/bundled/memoryGraphHtml": typeof mcp_bundled_memoryGraphHtml;
  "mcp/codebases": typeof mcp_codebases;
  "mcp/files": typeof mcp_files;
  "mcp/graph": typeof mcp_graph;
  "mcp/memoryGraphApp": typeof mcp_memoryGraphApp;
  "mcp/native": typeof mcp_native;
  "mcp/nodeActions": typeof mcp_nodeActions;
  "mcp/oauth": typeof mcp_oauth;
  "mcp/profiles": typeof mcp_profiles;
  "mcp/resources": typeof mcp_resources;
  "mcp/schemas": typeof mcp_schemas;
  "mcp/toolCatalog": typeof mcp_toolCatalog;
  "mcp/toolHandlers": typeof mcp_toolHandlers;
  "mcp/tools": typeof mcp_tools;
  "mcp/wiki": typeof mcp_wiki;
  memoryApi: typeof memoryApi;
  "memoryApi/auth": typeof memoryApi_auth;
  "memoryApi/personal": typeof memoryApi_personal;
  "memoryApi/team": typeof memoryApi_team;
  "memoryApi/types": typeof memoryApi_types;
  memoryEvents: typeof memoryEvents;
  "neo4jActions/_memories/actions": typeof neo4jActions__memories_actions;
  "neo4jActions/_memories/chunks": typeof neo4jActions__memories_chunks;
  "neo4jActions/_memories/create": typeof neo4jActions__memories_create;
  "neo4jActions/_memories/delete": typeof neo4jActions__memories_delete;
  "neo4jActions/_memories/postMaterialize": typeof neo4jActions__memories_postMaterialize;
  "neo4jActions/_memories/read": typeof neo4jActions__memories_read;
  "neo4jActions/_memories/shared": typeof neo4jActions__memories_shared;
  "neo4jActions/_memories/team": typeof neo4jActions__memories_team;
  "neo4jActions/_memories/update": typeof neo4jActions__memories_update;
  "neo4jActions/agent": typeof neo4jActions_agent;
  "neo4jActions/agent/applyFactDecision": typeof neo4jActions_agent_applyFactDecision;
  "neo4jActions/agent/factDecisionLoop": typeof neo4jActions_agent_factDecisionLoop;
  "neo4jActions/agent/shared": typeof neo4jActions_agent_shared;
  "neo4jActions/agent/storeFromInstruction": typeof neo4jActions_agent_storeFromInstruction;
  "neo4jActions/agent/summarizeRetrieve": typeof neo4jActions_agent_summarizeRetrieve;
  "neo4jActions/agent/updateFromInstruction": typeof neo4jActions_agent_updateFromInstruction;
  "neo4jActions/codebases": typeof neo4jActions_codebases;
  "neo4jActions/connectorData": typeof neo4jActions_connectorData;
  "neo4jActions/connectorSync": typeof neo4jActions_connectorSync;
  "neo4jActions/connectors/googleDrive": typeof neo4jActions_connectors_googleDrive;
  "neo4jActions/connectors/googleShared": typeof neo4jActions_connectors_googleShared;
  "neo4jActions/connectors/notion": typeof neo4jActions_connectors_notion;
  "neo4jActions/connectors/shared": typeof neo4jActions_connectors_shared;
  "neo4jActions/dashboard": typeof neo4jActions_dashboard;
  "neo4jActions/dbSetup": typeof neo4jActions_dbSetup;
  "neo4jActions/dreamMode": typeof neo4jActions_dreamMode;
  "neo4jActions/dreamMode/entryPoints": typeof neo4jActions_dreamMode_entryPoints;
  "neo4jActions/dreamMode/runProfile": typeof neo4jActions_dreamMode_runProfile;
  "neo4jActions/enrichment": typeof neo4jActions_enrichment;
  "neo4jActions/enrichment/llm": typeof neo4jActions_enrichment_llm;
  "neo4jActions/factExtraction": typeof neo4jActions_factExtraction;
  "neo4jActions/graph": typeof neo4jActions_graph;
  "neo4jActions/mcp": typeof neo4jActions_mcp;
  "neo4jActions/memories": typeof neo4jActions_memories;
  "neo4jActions/migration": typeof neo4jActions_migration;
  "neo4jActions/migration/backfill": typeof neo4jActions_migration_backfill;
  "neo4jActions/migration/dedup": typeof neo4jActions_migration_dedup;
  "neo4jActions/migration/entityAliases": typeof neo4jActions_migration_entityAliases;
  "neo4jActions/migration/profiles": typeof neo4jActions_migration_profiles;
  "neo4jActions/migration/retag": typeof neo4jActions_migration_retag;
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
  "profiles/mcpAccess": typeof profiles_mcpAccess;
  "prompts/enrichmentPrompt": typeof prompts_enrichmentPrompt;
  "prompts/sdkPrompt": typeof prompts_sdkPrompt;
  "prompts/systemSkillSeeds": typeof prompts_systemSkillSeeds;
  "prompts/v2Prompt": typeof prompts_v2Prompt;
  proposedUpdateApi: typeof proposedUpdateApi;
  relationshipApi: typeof relationshipApi;
  retrier: typeof retrier;
  skillVersions: typeof skillVersions;
  skills: typeof skills;
  systemSkills: typeof systemSkills;
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
  wikiVersions: typeof wikiVersions;
  "wiki/path": typeof wiki_path;
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
