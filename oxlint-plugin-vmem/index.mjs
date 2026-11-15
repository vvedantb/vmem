// vmem custom oxlint plugin — enforces the "parse at the boundary with zod,
// don't hand-roll narrowing" conventions the built-in rules can't express.
//
// Wired via `jsPlugins` in ../.oxlintrc.json. Rules are ESLint-compatible AST
// visitors (oxlint JS plugins are alpha and not subject to semver).
//
// no-double-cast, no-json-parse, no-source-text-in-tests and
// no-value-block-in-try come from the shared vvedantb plugin. The six rules
// below are in the shared repo but @vvedantb/config 0.7.0 does not register
// them in its plugin, so they stay local until it does.

import noUnknownShapeProbing from "./rules/no-unknown-shape-probing.mjs";
import noEngineImportsConvex from "./rules/no-engine-imports-convex.mjs";
import noTsNocheck from "./rules/no-ts-nocheck.mjs";
import noCrossPackageRelativeImports from "./rules/no-cross-package-relative-imports.mjs";
import noInlineObjectTypeAssertion from "./rules/no-inline-object-type-assertion.mjs";
import preferSchemaInferredTypes from "./rules/prefer-schema-inferred-types.mjs";
import noDeepPackageImports from "./rules/no-deep-package-imports.mjs";
import noConditionalTests from "./rules/no-conditional-tests.mjs";
import noInlineZodSchema from "./rules/no-inline-zod-schema.mjs";

export default {
  meta: { name: "vmem" },
  rules: {
    "no-unknown-shape-probing": noUnknownShapeProbing,
    "no-engine-imports-convex": noEngineImportsConvex,
    "no-ts-nocheck": noTsNocheck,
    "no-cross-package-relative-imports": noCrossPackageRelativeImports,
    "no-inline-object-type-assertion": noInlineObjectTypeAssertion,
    "prefer-schema-inferred-types": preferSchemaInferredTypes,
    "no-deep-package-imports": noDeepPackageImports,
    "no-conditional-tests": noConditionalTests,
    "no-inline-zod-schema": noInlineZodSchema,
  },
};
