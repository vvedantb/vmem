import { isIdentifier } from "../utils.mjs";

const message =
  "Do not assign a bare `JSON.parse(...)` result — it is `any` and flows " +
  "unchecked. Either validate at the boundary (`schema.safeParse(JSON.parse(x))` " +
  "or `parseJsonString(raw, schema)`), or annotate the result `: unknown` so " +
  "downstream code must narrow it. Both of those forms are allowed.";

const isJsonParse = (node) =>
  node?.type === "CallExpression" &&
  node.callee?.type === "MemberExpression" &&
  isIdentifier(node.callee.object, "JSON") &&
  isIdentifier(node.callee.property, "parse");

const isUnknownKeyword = (node) => node?.type === "TSUnknownKeyword";

export default {
  meta: {
    type: "problem",
    docs: { description: message },
  },
  create(context) {
    // JSON.parse nodes that sit in a disciplined position. Enclosing nodes are
    // visited before the inner JSON.parse (top-down), so this is populated in
    // time for the check below.
    const allowed = new Set();
    const allow = (node) => {
      if (isJsonParse(node)) allowed.add(node);
    };

    return {
      CallExpression(node) {
        const callee = node.callee;
        // `schema.safeParse(JSON.parse(...))` / `schema.parse(JSON.parse(...))`
        if (
          callee?.type === "MemberExpression" &&
          !isIdentifier(callee.object, "JSON") &&
          (isIdentifier(callee.property, "safeParse") ||
            isIdentifier(callee.property, "parse"))
        ) {
          for (const arg of node.arguments ?? []) allow(arg);
        }

        if (isJsonParse(node) && !allowed.has(node)) {
          context.report({ node, message });
        }
      },
      // `const x: unknown = JSON.parse(...)`
      VariableDeclarator(node) {
        if (isUnknownKeyword(node.id?.typeAnnotation?.typeAnnotation)) {
          allow(node.init);
        }
      },
      // `JSON.parse(...) as unknown`
      TSAsExpression(node) {
        if (isUnknownKeyword(node.typeAnnotation)) allow(node.expression);
      },
    };
  },
};
