import { codebasesToolSpecs } from "./toolsCodebases";
import { coreToolSpecs } from "./toolsCore";
import { filesToolSpecs } from "./toolsFiles";
import { memoryToolSpecs } from "./toolsMemory";
import { skillsToolSpecs } from "./toolsSkills";
import { wikiToolSpecs } from "./toolsWiki";

export const toolSpecs = {
  ...coreToolSpecs,
  ...memoryToolSpecs,
  ...skillsToolSpecs,
  ...wikiToolSpecs,
  ...filesToolSpecs,
  ...codebasesToolSpecs,
};
