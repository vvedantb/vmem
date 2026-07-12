import { isIdentifier } from "../utils.mjs";

const message =
  "Zod schema builders (`z.object`, `z.string`, etc.) must be declared at " +
  "module scope. Hoist to a top-level `const` (or export) and reuse it — " +
  "do not create schemas inside functions, methods, or blocks.";

const CALLBACK_METHODS = new Set([
  "lazy",
  "transform",
  "superRefine",
  "refine",
  "pipe",
  "catch",
  "default",
  "preprocess",
  "check",
]);

const NON_MODULE_SCOPE_ANCESTORS = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "MethodDefinition",
  "IfStatement",
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
  "SwitchStatement",
  "SwitchCase",
  "TryStatement",
  "CatchClause",
]);

const isBlockInsideFunction = (block) => {
  const parent = block.parent;
  return (
    parent?.type === "FunctionDeclaration" ||
    parent?.type === "FunctionExpression" ||
    parent?.type === "ArrowFunctionExpression" ||
    parent?.type === "MethodDefinition"
  );
};

/** Module scope = not inside functions/methods/control-flow blocks. */
const isAtModuleScope = (node) => {
  let current = node.parent;
  while (current && current.type !== "Program") {
    if (NON_MODULE_SCOPE_ANCESTORS.has(current.type)) return false;
    if (current.type === "BlockStatement" && isBlockInsideFunction(current)) {
      return false;
    }
    // Chained schema methods: z.string().optional().catch(null)
    if (
      current.type === "MemberExpression" &&
      current.parent?.type === "CallExpression"
    ) {
      current = current.parent;
      continue;
    }
    current = current.parent;
  }
  return current?.type === "Program";
};

/** True if expression is `z.<method>(...)` or chained `z.object(...).strict()`. */
const isZodSchemaExpression = (node) => {
  if (node?.type !== "CallExpression") return false;
  const callee = node.callee;
  if (callee?.type === "MemberExpression") {
    if (isIdentifier(callee.object, "z")) return true;
    return isZodSchemaExpression(callee.object);
  }
  return false;
};

const isInCalleeChain = (node, callExpr) => {
  let current = node;
  while (current && current !== callExpr) {
    if (current.parent === callExpr.callee) return true;
    current = current.parent;
  }
  return false;
};

const isNestedInZodBuilderArgs = (node) => {
  let current = node.parent;
  while (current) {
    if (
      current.type === "CallExpression" &&
      isZodSchemaExpression(current) &&
      current !== node &&
      !isInCalleeChain(node, current)
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
};

const isInExemptCallback = (node) => {
  let current = node.parent;
  while (current) {
    if (
      current.type === "ArrowFunctionExpression" ||
      current.type === "FunctionExpression"
    ) {
      const fn = current;
      const callParent = fn.parent;
      if (
        callParent?.type === "CallExpression" &&
        callParent.arguments.includes(fn)
      ) {
        const callee = callParent.callee;
        if (callee?.type === "MemberExpression") {
          const method = callee.property?.name;
          if (method && CALLBACK_METHODS.has(method)) return true;
          if (isIdentifier(callee.object, "z") && method === "lazy")
            return true;
        }
      }
    }
    current = current.parent;
  }
  return false;
};

export default {
  meta: {
    type: "problem",
    docs: { description: message },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isZodSchemaExpression(node)) return;
        if (isAtModuleScope(node)) return;
        if (isNestedInZodBuilderArgs(node)) return;
        if (isInExemptCallback(node)) return;
        context.report({ node, message });
      },
    };
  },
};
