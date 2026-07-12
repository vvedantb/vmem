import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const message =
  "Do not use a relative import that crosses a workspace package boundary. " +
  "Import the target via its package name (e.g. `@vmem/shared`) instead.";

const packageRoots = collectPackageRoots().sort(
  (a, b) => b.root.length - a.root.length,
);

export default {
  meta: {
    type: "problem",
    docs: { description: message },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const specifier = node.source?.value;
        if (typeof specifier !== "string" || !specifier.startsWith(".")) return;

        const filename = context.filename ?? context.getFilename?.();
        const target = getCrossPackageRelativeImport(filename, specifier);
        if (!target) return;

        context.report({
          node: node.source,
          message: `${message} Target package: ${target.name}.`,
        });
      },
    };
  },
};

function getCrossPackageRelativeImport(filename, specifier) {
  const sourcePackage = findPackageRoot(path.resolve(filename));
  if (!sourcePackage) return undefined;

  const resolved = path.resolve(path.dirname(filename), specifier);
  const targetPackage = findPackageRoot(resolved);
  if (!targetPackage || targetPackage.root === sourcePackage.root) {
    return undefined;
  }

  return targetPackage;
}

function findPackageRoot(absolutePath) {
  const normalized = path.normalize(absolutePath);
  return packageRoots.find(
    (pkg) =>
      normalized === pkg.root ||
      normalized.startsWith(`${pkg.root}${path.sep}`),
  );
}

function collectPackageRoots() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "../..");
  const roots = [];
  for (const root of ["packages", "apps"]) {
    collectPackageRootsFrom(path.join(repoRoot, root), roots);
  }
  return roots;
}

function collectPackageRootsFrom(dir, roots) {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "node_modules") continue;

    const packageRoot = path.join(dir, entry.name);
    const packageJsonPath = path.join(packageRoot, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      const json = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      if (typeof json.name === "string") {
        roots.push({ root: path.normalize(packageRoot), name: json.name });
      }
      continue;
    }

    collectPackageRootsFrom(packageRoot, roots);
  }
}
