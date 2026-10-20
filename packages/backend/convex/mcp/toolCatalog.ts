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
  ...profilesToolSpecs,
  ...teamsToolSpecs,
  ...settingsToolSpecs,
  ...connectorsToolSpecs,
  ...usageToolSpecs,
};
