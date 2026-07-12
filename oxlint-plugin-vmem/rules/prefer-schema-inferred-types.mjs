import { isIdentifier } from "../utils.mjs";

const message =
  "This object type duplicates a nearby zod schema. Prefer " +
  "`type Foo = z.infer<typeof fooSchema>` (or export the inferred type from " +
  "the schema) instead of hand-writing a matching interface/type literal.";

const schemaSuffixPattern = /(Schema)$/;

const schemaBaseName = (name) => {
  const base = name.replace(schemaSuffixPattern, "");
  return base.length > 0 && base !== name ? base : undefined;
};

/** True if expression is `z.<method>(...)` or nested `z.object(...).…`. */
const isZodSchemaExpression = (node) => {
  if (node?.type !== "CallExpression") return false;
  const callee = node.callee;
  if (callee?.type === "MemberExpression") {
    // z.object / z.array / z.string / …
    if (isIdentifier(callee.object, "z")) return true;
    // chained: z.object(...).strict() etc — walk left
    return isZodSchemaExpression(callee.object);
  }
  return false;
};

const isObjectTypeAlias = (node) =>
  node.typeAnnotation?.type === "TSTypeLiteral";

const isZodInferredType = (node) => {
  // type X = z.infer<typeof schema>
  const ann = node.typeAnnotation;
  if (ann?.type !== "TSTypeReference") return false;
  const nameNode = ann.typeName;
  if (nameNode?.type === "TSQualifiedName") {
    return (
      isIdentifier(nameNode.left, "z") && isIdentifier(nameNode.right, "infer")
    );
  }
  return false;
};

export default {
  meta: {
    type: "problem",
    docs: { description: message },
  },
  create(context) {
    const schemaBases = new Set();
    const candidates = [];

    return {
      VariableDeclarator(node) {
        if (!isIdentifier(node.id) || !isZodSchemaExpression(node.init)) return;
        const base = schemaBaseName(node.id.name);
        if (base) schemaBases.add(base);
        // Also accept camelCase: fooSchema → Foo (case-insensitive match later)
        schemaBases.add(node.id.name.replace(schemaSuffixPattern, ""));
      },
      TSInterfaceDeclaration(node) {
        candidates.push({ node, name: node.id?.name });
      },
      TSTypeAliasDeclaration(node) {
        if (!isObjectTypeAlias(node) || isZodInferredType(node)) return;
        candidates.push({ node, name: node.id?.name });
      },
      "Program:exit"() {
        for (const candidate of candidates) {
          if (!candidate.name) continue;
          const matches = [...schemaBases].some(
            (base) =>
              base.toLowerCase() === candidate.name.toLowerCase() ||
              base === candidate.name,
          );
          if (!matches) continue;
          context.report({ node: candidate.node, message });
        }
      },
    };
  },
};
