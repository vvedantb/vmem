import type { api } from "@vmem/backend";
import type { FunctionReturnType } from "convex/server";

export const codebaseLanguageColors: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Rust: "#dea584",
  Go: "#00ADD8",
  Java: "#b07219",
  "C#": "#178600",
  "C++": "#f34b7d",
  C: "#555555",
  Ruby: "#701516",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  PHP: "#4F5D95",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Shell: "#89e051",
  Lua: "#000080",
  Zig: "#ec915c",
  Vue: "#41b883",
  Svelte: "#ff3e00",
};

export type CodebaseItem = FunctionReturnType<
  typeof api.codebases.listMy
>[number];
