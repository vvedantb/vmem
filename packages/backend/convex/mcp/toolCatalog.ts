import { bindToolSpec, type McpBindableTool } from "./toolTypes";
import { codebasesToolSpecs } from "./toolsCodebases";
import { coreToolSpecs } from "./toolsCore";
import { filesToolSpecs } from "./toolsFiles";
import { memoryToolSpecs } from "./toolsMemory";
import { skillsToolSpecs } from "./toolsSkills";
import { wikiToolSpecs } from "./toolsWiki";

export type { McpBindableTool } from "./toolTypes";
export { bindToolSpec } from "./toolTypes";

export const toolSpecs = {
  ...coreToolSpecs,
  ...memoryToolSpecs,
  ...skillsToolSpecs,
  ...wikiToolSpecs,
  ...filesToolSpecs,
  ...codebasesToolSpecs,
};

export const bindableToolSpecs = Object.fromEntries(
  Object.entries(toolSpecs).map(([key, spec]) => [key, bindToolSpec(spec)]),
) satisfies Record<string, McpBindableTool>;
