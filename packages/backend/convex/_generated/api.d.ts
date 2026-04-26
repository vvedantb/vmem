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
import type * as codebases from "../codebases.js";
import type * as connectorOAuth from "../connectorOAuth.js";
import type * as connectorSync from "../connectorSync.js";
import type * as connectorTokens from "../connectorTokens.js";
import type * as connectors from "../connectors.js";
import type * as contextPromptActions from "../contextPromptActions.js";
import type * as contextPromptApi from "../contextPromptApi.js";
import type * as contextPromptCache from "../contextPromptCache.js";
import type * as dashboardApi from "../dashboardApi.js";
import type * as fileImport from "../fileImport.js";
import type * as github from "../github.js";
import type * as graphApi from "../graphApi.js";
import type * as http from "../http.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_envVars from "../lib/envVars.js";
import type * as mcpProfiles from "../mcpProfiles.js";
import type * as mcpSkills from "../mcpSkills.js";
import type * as memoryApi from "../memoryApi.js";
import type * as memoryEvents from "../memoryEvents.js";
import type * as neo4jActions_codebases from "../neo4jActions/codebases.js";
import type * as neo4jActions_connectorSync from "../neo4jActions/connectorSync.js";
import type * as neo4jActions_dashboard from "../neo4jActions/dashboard.js";
import type * as neo4jActions_dbSetup from "../neo4jActions/dbSetup.js";
import type * as neo4jActions_enrichment from "../neo4jActions/enrichment.js";
import type * as neo4jActions_factExtraction from "../neo4jActions/factExtraction.js";
import type * as neo4jActions_graph from "../neo4jActions/graph.js";
import type * as neo4jActions_mcp from "../neo4jActions/mcp.js";
import type * as neo4jActions_memories from "../neo4jActions/memories.js";
import type * as neo4jActions_migration from "../neo4jActions/migration.js";
import type * as neo4jActions_proposedUpdates from "../neo4jActions/proposedUpdates.js";
import type * as neo4jActions_relationships from "../neo4jActions/relationships.js";
import type * as neo4jActions_timeline from "../neo4jActions/timeline.js";
import type * as notifications from "../notifications.js";
import type * as profiles from "../profiles.js";
import type * as proposedUpdateApi from "../proposedUpdateApi.js";
import type * as relationshipApi from "../relationshipApi.js";
import type * as retrier from "../retrier.js";
import type * as skills from "../skills.js";
import type * as teams from "../teams.js";
import type * as timelineApi from "../timelineApi.js";
import type * as userEnvVars from "../userEnvVars.js";
import type * as userEnvVarsActions from "../userEnvVarsActions.js";
import type * as userSettings from "../userSettings.js";
import type * as users from "../users.js";
import type * as validators from "../validators.js";
import type * as wiki from "../wiki.js";

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
  codebases: typeof codebases;
  connectorOAuth: typeof connectorOAuth;
  connectorSync: typeof connectorSync;
  connectorTokens: typeof connectorTokens;
  connectors: typeof connectors;
  contextPromptActions: typeof contextPromptActions;
  contextPromptApi: typeof contextPromptApi;
  contextPromptCache: typeof contextPromptCache;
  dashboardApi: typeof dashboardApi;
  fileImport: typeof fileImport;
  github: typeof github;
  graphApi: typeof graphApi;
  http: typeof http;
  "lib/crypto": typeof lib_crypto;
  "lib/envVars": typeof lib_envVars;
  mcpProfiles: typeof mcpProfiles;
  mcpSkills: typeof mcpSkills;
  memoryApi: typeof memoryApi;
  memoryEvents: typeof memoryEvents;
  "neo4jActions/codebases": typeof neo4jActions_codebases;
  "neo4jActions/connectorSync": typeof neo4jActions_connectorSync;
  "neo4jActions/dashboard": typeof neo4jActions_dashboard;
  "neo4jActions/dbSetup": typeof neo4jActions_dbSetup;
  "neo4jActions/enrichment": typeof neo4jActions_enrichment;
  "neo4jActions/factExtraction": typeof neo4jActions_factExtraction;
  "neo4jActions/graph": typeof neo4jActions_graph;
  "neo4jActions/mcp": typeof neo4jActions_mcp;
  "neo4jActions/memories": typeof neo4jActions_memories;
  "neo4jActions/migration": typeof neo4jActions_migration;
  "neo4jActions/proposedUpdates": typeof neo4jActions_proposedUpdates;
  "neo4jActions/relationships": typeof neo4jActions_relationships;
  "neo4jActions/timeline": typeof neo4jActions_timeline;
  notifications: typeof notifications;
  profiles: typeof profiles;
  proposedUpdateApi: typeof proposedUpdateApi;
  relationshipApi: typeof relationshipApi;
  retrier: typeof retrier;
  skills: typeof skills;
  teams: typeof teams;
  timelineApi: typeof timelineApi;
  userEnvVars: typeof userEnvVars;
  userEnvVarsActions: typeof userEnvVarsActions;
  userSettings: typeof userSettings;
  users: typeof users;
  validators: typeof validators;
  wiki: typeof wiki;
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
  auditLog: import("convex-audit-log/_generated/component.js").ComponentApi<"auditLog">;
};
