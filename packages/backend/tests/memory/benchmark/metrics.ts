export function recallAtK(
  rankedIds: readonly string[],
  relevant: readonly string[],
  k: number,
): number {
  if (relevant.length === 0) return 1;
  const top = new Set(rankedIds.slice(0, k));
  let hits = 0;
  for (const id of relevant) {
    if (top.has(id)) hits += 1;
  }
  return hits / relevant.length;
}

export function mrr(
  rankedIds: readonly string[],
  relevant: readonly string[],
): number {
  const wanted = new Set(relevant);
  for (let i = 0; i < rankedIds.length; i += 1) {
    const id = rankedIds[i];
    if (id !== undefined && wanted.has(id)) return 1 / (i + 1);
  }
  return 0;
}

export function ndcgAtK(
  rankedIds: readonly string[],
  relevant: readonly string[],
  k: number,
): number {
  const gains = new Map<string, number>();
  relevant.forEach((id, index) => {
    gains.set(id, relevant.length - index);
  });
  let dcg = 0;
  const limit = Math.min(k, rankedIds.length);
  for (let i = 0; i < limit; i += 1) {
    const id = rankedIds[i];
    if (id === undefined) continue;
    const gain = gains.get(id) ?? 0;
    dcg += gain / Math.log2(i + 2);
  }
  const ideal = [...relevant].slice(0, k);
  let idcg = 0;
  for (let i = 0; i < ideal.length; i += 1) {
    const id = ideal[i];
    if (id === undefined) continue;
    const gain = gains.get(id) ?? 0;
    idcg += gain / Math.log2(i + 2);
  }
  if (idcg === 0) return 0;
  return dcg / idcg;
}

export interface QueryMetrics {
  id: string;
  recall1: number;
  recall5: number;
  mrr: number;
  ndcg5: number;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
