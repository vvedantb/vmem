import { contextToolSpecs } from "./toolsContext";
import { coreToolSpecs } from "./toolsCore";
import { filesToolSpecs } from "./toolsFiles";
import { memoryToolSpecs } from "./toolsMemory";
import { skillsToolSpecs } from "./toolsSkills";
import { wikiToolSpecs } from "./toolsWiki";

export const toolSpecs = {
  ...coreToolSpecs,
  ...contextToolSpecs,
  ...memoryToolSpecs,
  ...skillsToolSpecs,
  ...wikiToolSpecs,
  ...filesToolSpecs,
};
