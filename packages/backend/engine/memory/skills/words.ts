/**
 * Word helpers shared by the skill modules, Dream Mode and the
 * frontiermemory eval. Pure and dependency-free.
 */

const STOPWORDS = new Set(
  (
    "the and for are but not you your with this that from have has was were will " +
    "can all any its into than then them they their there these those what when " +
    "which who why how use using used should would could must also just only each " +
    "some such out our about over under after before more most other very make " +
    "made does did done get got file files run runs please task need needs want"
  ).split(" "),
);

/** Lowercase content words, at least 3 chars, stopwords removed. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

export function jaccard(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
): number {
  if (a.size === 0 && b.size === 0) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** Token set with digits masked, so "step 3" and "step 4" compare equal. */
export function lessonKey(text: string): Set<string> {
  return new Set(tokenize(text.replace(/\d+/g, "#")));
}

export function slugify(text: string, maxLength = 48): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/, "");
  return slug.length > 0 ? slug : "untitled";
}
