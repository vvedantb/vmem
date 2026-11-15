// vmem custom oxlint plugin — enforces the "parse at the boundary with zod,
// don't hand-roll narrowing" conventions the built-in rules can't express.
//
// Wired via `jsPlugins` in ../.oxlintrc.json. Rules are ESLint-compatible AST
// visitors (oxlint JS plugins are alpha and not subject to semver).
//
// Rules that are not specific to this repo come from the shared vvedantb
// plugin (@vvedantb/config). The three below encode this repo's package layout.

import noEngineImportsConvex from "./rules/no-engine-imports-convex.mjs";
import noCrossPackageRelativeImports from "./rules/no-cross-package-relative-imports.mjs";
import noDeepPackageImports from "./rules/no-deep-package-imports.mjs";

export default {
  meta: { name: "vmem" },
  rules: {
    "no-engine-imports-convex": noEngineImportsConvex,
    "no-cross-package-relative-imports": noCrossPackageRelativeImports,
    "no-deep-package-imports": noDeepPackageImports,
  },
};
