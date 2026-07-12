// vmem custom oxlint plugin — enforces the "parse at the boundary with zod,
// don't hand-roll narrowing" conventions the built-in rules can't express.
//
// Wired via `jsPlugins` in ../.oxlintrc.json. Rules are ESLint-compatible AST
// visitors (oxlint JS plugins are alpha and not subject to semver).

import noUnknownShapeProbing from "./rules/no-unknown-shape-probing.mjs";
import noJsonParse from "./rules/no-json-parse.mjs";
import noDoubleCast from "./rules/no-double-cast.mjs";
import noEngineImportsConvex from "./rules/no-engine-imports-convex.mjs";
import noTsNocheck from "./rules/no-ts-nocheck.mjs";

export default {
  meta: { name: "vmem" },
  rules: {
    "no-unknown-shape-probing": noUnknownShapeProbing,
    "no-json-parse": noJsonParse,
    "no-double-cast": noDoubleCast,
    "no-engine-imports-convex": noEngineImportsConvex,
    "no-ts-nocheck": noTsNocheck,
  },
};
