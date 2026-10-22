import { artifactsToolSpecs } from "./toolsArtifacts";
import { connectorsToolSpecs } from "./toolsConnectors";
import { contextToolSpecs } from "./toolsContext";
import { coreToolSpecs } from "./toolsCore";
import { filesToolSpecs } from "./toolsFiles";
import { inboxToolSpecs } from "./toolsInbox";
import { memoryToolSpecs } from "./toolsMemory";
import { memoryManageToolSpecs } from "./toolsMemoryManage";
import { profilesToolSpecs } from "./toolsProfiles";
import { settingsToolSpecs } from "./toolsSettings";
import { skillsToolSpecs } from "./toolsSkills";
import { teamsToolSpecs } from "./toolsTeams";
import { usageToolSpecs } from "./toolsUsage";

export const toolSpecs = {
  ...coreToolSpecs,
  ...contextToolSpecs,
  ...memoryToolSpecs,
  ...memoryManageToolSpecs,
  ...inboxToolSpecs,
  ...skillsToolSpecs,
  ...filesToolSpecs,
  ...artifactsToolSpecs,
  ...profilesToolSpecs,
  ...teamsToolSpecs,
  ...settingsToolSpecs,
  ...connectorsToolSpecs,
  ...usageToolSpecs,
};

// tools that stay web UI only and must never be registered on MCP
export const MCP_EXCLUDED_TOOL_NAMES = [
  // memory_delete_all: destructive account-wide wipe, web UI only
  "memory_delete_all",
] as const;
