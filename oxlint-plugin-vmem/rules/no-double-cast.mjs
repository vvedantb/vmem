const message =
  "Avoid double casts (`x as A as B`, `x as unknown as T`). They silence the type " +
  "checker instead of proving the type. Validate at the boundary with a zod schema, " +
  "or fix the source type so a single (or no) cast suffices.";

export default {
  meta: {
    type: "problem",
    docs: { description: message },
  },
  create(context) {
    return {
      // `x as A as B` nests one TSAsExpression inside another.
      TSAsExpression(node) {
        if (node.expression?.type === "TSAsExpression") {
          context.report({ node, message });
        }
      },
    };
  },
};
