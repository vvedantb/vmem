import { parseAsInteger, parseAsString, parseAsStringLiteral } from "nuqs";
import { ARTIFACT_TYPES } from "@vvedantb/server";

// URL state for the `/artifacts` routes: list search, type filter and layout,
// and the version on screen in the viewer (null = current)

const ARTIFACT_LAYOUTS = ["grid", "list"] as const;

export const artifactsSearchParams = {
  q: parseAsString.withDefault(""),
  type: parseAsStringLiteral(ARTIFACT_TYPES),
  layout: parseAsStringLiteral(ARTIFACT_LAYOUTS).withDefault("grid"),
};

export const artifactViewerSearchParams = {
  v: parseAsInteger,
};
