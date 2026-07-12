/**
 * Ban deep imports into packages that only expose a root export.
 *
 * Apps/packages must import `@vmem/backend` and `@vmem/shared` at the package
 * root — never `@vmem/backend/…` or `@vmem/shared/…`. `@vmem/ui/cn` is allowed
 * (it is a published subpath export).
 */

const ROOT_ONLY = new Set(["@vmem/backend", "@vmem/shared", "@vmem/sdk"]);

const messageFor = (pkg) =>
  `Do not deep-import \`${pkg}\`. Import from the package root only ` +
  `(e.g. \`import { api } from "${pkg}"\`).`;

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow deep imports into packages that only expose a root export.",
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const specifier = node.source?.value;
        if (typeof specifier !== "string") return;

        for (const pkg of ROOT_ONLY) {
          if (specifier === pkg) return;
          if (specifier.startsWith(`${pkg}/`)) {
            context.report({
              node: node.source,
              message: messageFor(pkg),
            });
            return;
          }
        }
      },
    };
  },
};
