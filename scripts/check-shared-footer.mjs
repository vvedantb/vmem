// Guard: footers must use the shared @vvedantb/ui footer with no local overrides.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const skip = new Set([
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".output",
  "archive",
]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

const errors = [];
const footerFiles = [...walk(path.join(root, "apps"))].filter((f) =>
  /Footer[^/\\]*\.tsx$/.test(f),
);
const bareSocial =
  /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com|linkedin\.com)\/?(?=["'`])/;

for (const file of footerFiles) {
  const rel = path.relative(root, file);
  const src = readFileSync(file, "utf8");
  if (bareSocial.test(src)) {
    errors.push(
      `${rel}: bare twitter.com / x.com / linkedin.com placeholder href`,
    );
  }
  if (/<AppWordmark\b[^>]*\bsize=/.test(src)) {
    errors.push(`${rel}: AppWordmark size prop in footer`);
  }
  // App sidebar footers are not site footers.
  const isWebSiteFooter =
    rel.startsWith(path.join("apps", "web") + path.sep) &&
    !/[/\\]sidebar[/\\]/.test(rel);
  if (isWebSiteFooter) {
    const usesShared =
      /from\s+"@vvedantb\/ui"/.test(src) &&
      /\b(SiteFooter|LandingFooter)\b/.test(src);
    if (!usesShared) {
      errors.push(
        `${rel}: must render SiteFooter or LandingFooter from @vvedantb/ui`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error(
    "Shared footer check failed:\n" + errors.map((e) => `  - ${e}`).join("\n"),
  );
  process.exit(1);
}
console.log(`Shared footer check passed (${footerFiles.length} footer files).`);
