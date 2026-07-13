/** Fraction of expected titles present in the top-k results (set recall@k). */
export function recallAtK(
  titles: readonly string[],
  expectedTitles: readonly string[],
  k: number,
): number {
  if (expectedTitles.length === 0) return 0;
  const topK = new Set(titles.slice(0, k));
  const hits = expectedTitles.filter((title) => topK.has(title)).length;
  return hits / expectedTitles.length;
}

/** Fraction of expected titles that appear in the top five results. */
export function recallAtFive(
  titles: readonly string[],
  expectedTitles: readonly string[],
): number {
  return recallAtK(titles, expectedTitles, 5);
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

/** Fraction of the top-k results that are relevant (precision@k). */
export function precisionAtK(
  titles: readonly string[],
  expectedTitles: readonly string[],
  k: number,
): number {
  if (k <= 0) return 0;
  const expected = new Set(expectedTitles);
  const topK = titles.slice(0, k);
  if (topK.length === 0) return 0;
  const hits = topK.filter((title) => expected.has(title)).length;
  return hits / topK.length;
}

/**
 * Normalised Discounted Cumulative Gain at k over graded relevance.
 * Grades default to 1 (binary) for titles absent from `gradeByTitle`-only sets;
 * pass a full grade map for graded relevance. Gain = 2^grade − 1, discount = log2(rank+1).
 */
export function ndcgAtK(
  titles: readonly string[],
  gradeByTitle: ReadonlyMap<string, number>,
  k: number,
): number {
  const dcg = (grades: readonly number[]): number =>
    grades.reduce(
      (sum, grade, index) =>
        sum + (Math.pow(2, grade) - 1) / Math.log2(index + 2),
      0,
    );

  const retrievedGrades = titles
    .slice(0, k)
    .map((title) => gradeByTitle.get(title) ?? 0);
  const idealGrades = [...gradeByTitle.values()]
    .filter((grade) => grade > 0)
    .sort((a, b) => b - a)
    .slice(0, k);

  const ideal = dcg(idealGrades);
  return ideal === 0 ? 0 : dcg(retrievedGrades) / ideal;
}

/** Nearest-rank percentile over a copy of the values. Empty → 0. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank - 1, 0), sorted.length - 1)] ?? 0;
}

/** Arithmetic mean. Empty → 0. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
