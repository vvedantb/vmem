// Guard: the landing page must use the shared @vvedantb/ui SiteHeader.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const landingDir = path.join(
  root,
  "apps",
  "web",
  "src",
  "routes",
  "_components",
  "landing",
);
const skip = new Set(["node_modules", "dist", "build"]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

const errors = [];
const pagePath = path.join(landingDir, "LandingPage.tsx");
if (!existsSync(pagePath)) {
  errors.push("LandingPage.tsx not found");
} else {
  const src = readFileSync(pagePath, "utf8");
  const usesShared =
    /import\s*\{[^}]*\bSiteHeader\b[^}]*\}\s*from\s*"@vvedantb\/ui"/.test(
      src,
    ) && /<SiteHeader\b/.test(src);
  if (!usesShared) {
    errors.push("LandingPage.tsx: must render SiteHeader from @vvedantb/ui");
  }
}

for (const file of walk(path.join(root, "apps", "web", "src"))) {
  if (/LandingNav(Menu)?[^/\\]*\.tsx?$/.test(path.basename(file))) {
    errors.push(
      `${path.relative(root, file)}: local LandingNav / LandingNavMenu is not allowed`,
    );
  }
}

if (errors.length > 0) {
  console.error(
    "Shared header check failed:\n" + errors.map((e) => `  - ${e}`).join("\n"),
  );
  process.exit(1);
}
console.log("Shared header check passed.");
