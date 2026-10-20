import { contextToolSpecs } from "./toolsContext";
import { coreToolSpecs } from "./toolsCore";
import { filesToolSpecs } from "./toolsFiles";
import { memoryToolSpecs } from "./toolsMemory";
import { memoryManageToolSpecs } from "./toolsMemoryManage";
import { skillsToolSpecs } from "./toolsSkills";

export const toolSpecs = {
  ...coreToolSpecs,
  ...contextToolSpecs,
  ...memoryToolSpecs,
  ...memoryManageToolSpecs,
  ...skillsToolSpecs,
  ...filesToolSpecs,
};
