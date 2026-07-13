import path from "node:path";
import { toPosix } from "../utils.mjs";

const message =
  "engine/ must not import from convex/. The engine layer is provider-agnostic " +
  "(Neo4j/LLM logic, reusable outside Convex); depending on convex/ inverts the " +
  "layering. Move the shared code into engine/, or have convex/ pass it in.";

export default {
  meta: {
    type: "problem",
    docs: { description: message },
  },
  create(context) {
    const filename = toPosix(context.filename ?? context.getFilename?.());
    // Only enforce inside the engine layer of the backend package.
    if (!filename.includes("/packages/backend/engine/")) return {};

    return {
      ImportDeclaration(node) {
        const specifier = node.source?.value;
        if (typeof specifier !== "string" || !specifier.startsWith(".")) return;
        const resolved = toPosix(
          path.resolve(path.dirname(filename), specifier),
        );
        if (resolved.includes("/packages/backend/convex/")) {
          context.report({ node: node.source, message });
        }
      },
    };
  },
};
