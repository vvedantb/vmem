export interface EmbeddingItem {
  embedding: number[];
  index: number;
}

interface RawEmbeddingItem {
  embedding: number[] | string;
  index?: number;
}

function parseEmbeddingItem(
  item: RawEmbeddingItem,
  dimensions: number,
  fallbackIndex: number,
): EmbeddingItem {
  if (!Array.isArray(item.embedding)) {
    throw new Error("embedding response: item missing embedding array");
  }
  if (item.embedding.length !== dimensions) {
    throw new Error(
      `embedding response: expected ${String(dimensions)} dims, got ${String(item.embedding.length)}`,
    );
  }
  return {
    embedding: item.embedding,
    index: item.index ?? fallbackIndex,
  };
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
  return data.map((item, index) => parseEmbeddingItem(item, dimensions, index));
}
