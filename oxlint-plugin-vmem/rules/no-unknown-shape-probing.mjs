import { isIdentifier } from "../utils.mjs";

// NOTE: intentionally does NOT flag `"key" in x`. In this codebase `in` is the
// idiomatic, sanctioned way to narrow discriminated unions (`"error" in auth`),
// walk Errors (`"code" in err`), and refine typed SDK unions (Notion, TipTap) —
// the eslint `isRecord` ban explicitly prefers that over `Reflect.get` ceremony.
// Only `Reflect.get` (dynamic property access that defeats the type system in
// domain code) is flagged here.
const message =
  "Do not use `Reflect.get` to read properties in domain code. Narrow a typed " +
  "value directly, or parse external input at its boundary with a zod schema " +
  "(`schema.safeParse(...)`) so downstream code is fully typed.";

const isReflectGet = (node) =>
  node?.type === "MemberExpression" &&
  isIdentifier(node.object, "Reflect") &&
  isIdentifier(node.property, "get");

export default {
  meta: {
    type: "problem",
    docs: { description: message },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (isReflectGet(node.callee)) {
          context.report({ node, message });
        }
      },
    };
  },
};
