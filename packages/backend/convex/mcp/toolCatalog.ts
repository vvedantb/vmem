import { contextToolSpecs } from "./toolsContext";
import { coreToolSpecs } from "./toolsCore";
import { filesToolSpecs } from "./toolsFiles";
import { memoryToolSpecs } from "./toolsMemory";
import { skillsToolSpecs } from "./toolsSkills";

export const toolSpecs = {
  ...coreToolSpecs,
  ...contextToolSpecs,
  ...memoryToolSpecs,
  ...skillsToolSpecs,
  ...filesToolSpecs,
};
