// Runs oxc-transform-react (the exact compiler the Vite plugin uses) over
// apps/web/src and fails when a file bails out of compilation for a reason not
// recorded in the baseline. A bailout is silent at build time — the compiler
// just skips memoizing the whole file — so this is the only gate that notices.
//
//   node scripts/compiler-check.mjs             check against the baseline
//   node scripts/compiler-check.mjs --update    rewrite the baseline from HEAD
//
// The baseline (scripts/compiler-check-baseline.json) keys on "file :: reason"
// rather than line numbers so unrelated edits do not churn it. Entries that no
// longer reproduce are reported so the baseline can be shrunk; they never fail
// the check. The try/catch family of bailouts is additionally linted live by
// the oxlint no-value-block-in-try rule — this script is the backstop that
// catches every other reason (refs, purity, incompatible libraries, ...).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// The root toolchain has no zod, so this is the boundary parser: same job as a
// schema, and it keeps `JSON.parse` from leaking an unchecked value downstream.
const baselineSchema = {
  parse: (value) => {
    if (!Array.isArray(value) || value.some((k) => typeof k !== "string")) {
      throw new Error("baseline must be an array of strings");
    }
    return value;
  },
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(ROOT, "apps", "web");
const BASELINE_PATH = path.join(
  ROOT,
  "scripts",
  "compiler-check-baseline.json",
);
const UPDATE = process.argv.includes("--update");

// Resolve through apps/web so we test what the Vite plugin runs.
const req = createRequire(path.join(WEB, "package.json"));
const { transformSync } = req("oxc-transform-react");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

function offsetToLine(source, offset) {
  let line = 1;
  const end = Math.min(Math.max(0, offset), source.length);
  for (let i = 0; i < end; i++) {
    if (source.charCodeAt(i) === 10) line++;
  }
  return line;
}

/** Recoverable compiler diagnostics only — parse failures are tsc's job. */
function isCompilerDiagnostic(error) {
  return error.severity !== "Advice";
}

// key: "relpath :: reason"  ->  [line, line, ...] for display only
const found = new Map();

for (const file of walk(path.join(WEB, "src"))) {
  const code = readFileSync(file, "utf8");
  if (code.includes('"use no memo"')) continue; // deliberate opt-out
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  const result = transformSync(file, code, {
    reactCompiler: { target: "19" },
    jsx: { runtime: "automatic" },
  });
  if (result.fatal) continue;
  for (const error of result.errors) {
    if (!isCompilerDiagnostic(error)) continue;
    const reason = String(error.message ?? "unknown reason");
    const key = `${rel} :: ${reason}`;
    const lines = found.get(key) ?? [];
    for (const label of error.labels ?? []) {
      if (typeof label.start === "number") {
        lines.push(offsetToLine(code, label.start));
      }
    }
    found.set(
      key,
      [...new Set(lines)].sort((a, b) => a - b),
    );
  }
}

const keys = [...found.keys()].sort((a, b) => a.localeCompare(b));

if (UPDATE) {
  writeFileSync(BASELINE_PATH, JSON.stringify(keys, null, 2) + "\n");
  console.log(`compiler-check: baseline updated (${keys.length} entries).`);
  process.exit(0);
}

let baseline = [];
try {
  baseline = baselineSchema.parse(
    JSON.parse(readFileSync(BASELINE_PATH, "utf8")),
  );
} catch {
  console.error(
    "compiler-check: no baseline found. Run `node scripts/compiler-check.mjs --update` first.",
  );
  process.exit(1);
}

const baselineSet = new Set(baseline);
const fresh = keys.filter((k) => !baselineSet.has(k));
const fixed = baseline.filter((k) => !found.has(k));

if (fixed.length > 0) {
  console.log(
    `compiler-check: ${fixed.length} baseline entr${fixed.length === 1 ? "y" : "ies"} no longer reproduce (run --update to shrink the baseline):`,
  );
  for (const k of fixed) console.log(`  - ${k}`);
}

if (fresh.length === 0) {
  console.log(
    `compiler-check: OK — ${keys.length} known bailout${keys.length === 1 ? "" : "s"}, none new.`,
  );
  process.exit(0);
}

console.error(
  `compiler-check: ${fresh.length} NEW React Compiler bailout${fresh.length === 1 ? "" : "s"} (whole file loses memoization):`,
);
for (const key of fresh) {
  const lines = found.get(key);
  console.error(
    `  ${key}${lines.length ? `  (line ${lines.join(", ")})` : ""}`,
  );
}
console.error(
  '\nFix the construct (see CLAUDE.md), add "use no memo" if the file must opt out,\nor run `node scripts/compiler-check.mjs --update` to accept it into the baseline.',
);
process.exit(1);
