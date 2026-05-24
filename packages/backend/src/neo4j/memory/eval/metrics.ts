/** Fraction of expected titles that appear in the top five results. */
export function recallAtFive(
  titles: readonly string[],
  expectedTitles: readonly string[],
): number {
  if (expectedTitles.length === 0) {
    return 0;
  }
  const topFive = new Set(titles.slice(0, 5));
  const hits = expectedTitles.filter((title) => topFive.has(title)).length;
  return hits / expectedTitles.length;
}

/** Mean reciprocal rank of the first relevant title in the result list. */
export function reciprocalRank(
  titles: readonly string[],
  expectedTitles: readonly string[],
): number {
  const expected = new Set(expectedTitles);
  const firstRelevantIndex = titles.findIndex((title) => expected.has(title));
  return firstRelevantIndex === -1 ? 0 : 1 / (firstRelevantIndex + 1);
}
