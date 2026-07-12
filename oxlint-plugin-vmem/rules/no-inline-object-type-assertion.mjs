import { isIdentifier } from "../utils.mjs";

const message =
  "Do not assert against an inline object-shaped type (`as { … }` or " +
  "`as Record<string, unknown>`). Use a named type, or parse with a zod " +
  "schema at the boundary.";

const isUnknownKeyword = (node) => node?.type === "TSUnknownKeyword";

const isStringKey = (node) =>
  node?.type === "TSStringKeyword" ||
  (node?.type === "TSLiteralType" && typeof node.literal?.value === "string");

const isRecordUnknown = (node) =>
  node?.type === "TSTypeReference" &&
  isIdentifier(node.typeName, "Record") &&
  node.typeArguments?.params?.length === 2 &&
  isStringKey(node.typeArguments.params[0]) &&
  isUnknownKeyword(node.typeArguments.params[1]);

const isBannedType = (node) =>
  node?.type === "TSTypeLiteral" || isRecordUnknown(node);

export default {
  meta: {
    type: "problem",
    docs: { description: message },
  },
  create(context) {
    const check = (node) => {
      if (isBannedType(node.typeAnnotation)) {
        context.report({ node, message });
      }
    };

    return {
      TSAsExpression: check,
      TSTypeAssertion: check,
    };
  },
};
