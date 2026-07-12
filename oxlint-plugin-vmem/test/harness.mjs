import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const oxlintBin = path.join(
  repoRoot,
  "node_modules",
  "oxlint",
  "bin",
  "oxlint",
);

/**
 * Run oxlint on a single in-memory source string for one vmem rule.
 *
 * `options` is either a filename shorthand (string, default "fixture.ts") or
 * an object:
 *   - filename: relative path of the linted file inside the temp dir. May be
 *     nested (e.g. "packages/backend/engine/foo.ts") — parent dirs are
 *     created as needed, which path-sensitive rules (no-engine-imports-convex)
 *     rely on.
 *   - extraFiles: map of relative path -> file content, written alongside the
 *     fixture before linting (e.g. synthetic package.json files).
 *   - baseDir: directory the temp dir is created under (default os.tmpdir()).
 *     Some rules (no-cross-package-relative-imports) resolve their package
 *     roots from this repo's real packages/apps folders rather than from
 *     anything under the linted file's own temp dir — pass
 *     `path.join(repoRoot, "packages")` to land the fixture where such rules
 *     will actually discover it.
 * Returns combined stdout+stderr and the exit code.
 */
export function runOxlintRule(ruleName, source, options = {}) {
  const {
    filename = "fixture.ts",
    extraFiles = {},
    baseDir = os.tmpdir(),
  } = typeof options === "string" ? { filename: options } : options;

  fs.mkdirSync(baseDir, { recursive: true });
  const dir = fs.mkdtempSync(path.join(baseDir, "vmem-oxlint-"));
  const filePath = path.join(dir, filename);
  const configPath = path.join(dir, ".oxlintrc.json");
  const pluginPath = path
    .join(repoRoot, "oxlint-plugin-vmem", "index.mjs")
    .replace(/\\/g, "/");

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source, "utf8");

  for (const [relativePath, content] of Object.entries(extraFiles)) {
    const extraPath = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(extraPath), { recursive: true });
    fs.writeFileSync(extraPath, content, "utf8");
  }

  fs.writeFileSync(
    configPath,
    JSON.stringify(
      {
        plugins: [],
        jsPlugins: [{ name: "vmem", specifier: pluginPath }],
        rules: {
          [`vmem/${ruleName}`]: "error",
          // Fixture snippets often declare unused locals; don't fail valid cases.
          "no-unused-vars": "off",
          "eslint/no-unused-vars": "off",
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  const result = spawnSync(
    process.execPath,
    [oxlintBin, "-c", configPath, filePath],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  // Keep temp dirs on failure for debugging? No — always clean.
  fs.rmSync(dir, { recursive: true, force: true });

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return { code: result.status ?? 1, output, error: result.error };
}

/** Assert the rule reports at least one diagnostic on `source`. */
export function assertInvalid(ruleName, source, options) {
  void test(`${ruleName} (invalid)`, () => {
    const { code, output, error } = runOxlintRule(ruleName, source, options);
    assert.equal(error, undefined, `spawn failed: ${error}`);
    assert.notEqual(
      code,
      0,
      `expected oxlint to fail for ${ruleName}, output:\n${output}`,
    );
    assert.match(
      output,
      new RegExp(`vmem\\(${ruleName}\\)`),
      `expected rule id vmem(${ruleName}) in output:\n${output}`,
    );
  });
}

/** Assert the rule does not report on `source`. */
export function assertValid(ruleName, source, options) {
  void test(`${ruleName} (valid)`, () => {
    const { code, output, error } = runOxlintRule(ruleName, source, options);
    assert.equal(error, undefined, `spawn failed: ${error}`);
    assert.equal(
      code,
      0,
      `expected oxlint to pass for ${ruleName}, output:\n${output}`,
    );
  });
}
