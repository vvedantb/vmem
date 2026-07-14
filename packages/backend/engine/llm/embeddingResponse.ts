export interface EmbeddingItem {
  embedding: number[];
  index: number;
}

export interface RawEmbeddingItem {
  embedding: number[] | string;
  index?: number;
}

export function validateEmbeddingItems(
  data: RawEmbeddingItem[],
  expectedCount: number,
  dimensions: number,
): EmbeddingItem[] {
  if (data.length !== expectedCount) {
    throw new Error(
      `embedding response: expected ${String(expectedCount)} items, got ${String(data.length)}`,
    );
  }

  const items: EmbeddingItem[] = [];
  for (const item of data) {
    if (!Array.isArray(item.embedding)) {
      throw new Error("embedding response: item missing embedding array");
    }
    if (item.embedding.length !== dimensions) {
      throw new Error(
        `embedding response: expected ${String(dimensions)} dims, got ${String(item.embedding.length)}`,
      );
    }
    items.push({
      embedding: item.embedding,
      index: item.index ?? items.length,
    });
  }

  return items;
}
