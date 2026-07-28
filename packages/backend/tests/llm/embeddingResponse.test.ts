import { describe, expect, it } from "vitest";
import { validateEmbeddingItems } from "../../engine/llm/embeddingResponse";

const DIMS = 4;

function vector(values: number[]): { embedding: number[] } {
  return { embedding: values };
}

describe("validateEmbeddingItems", () => {
  it("maps items in order with fallback indexes", () => {
    expect(
      validateEmbeddingItems(
        [vector([1, 0, 0, 0]), vector([0, 1, 0, 0])],
        2,
        DIMS,
      ),
    ).toEqual([
      { embedding: [1, 0, 0, 0], index: 0 },
      { embedding: [0, 1, 0, 0], index: 1 },
    ]);
  });

  it("preserves explicit indexes from the provider", () => {
    expect(
      validateEmbeddingItems(
        [{ embedding: [0, 0, 1, 0], index: 5 }, { embedding: [0, 0, 0, 1] }],
        2,
        DIMS,
      ),
    ).toEqual([
      { embedding: [0, 0, 1, 0], index: 5 },
      { embedding: [0, 0, 0, 1], index: 1 },
    ]);
  });

  it("throws when the item count does not match", () => {
    expect(() =>
      validateEmbeddingItems([vector([1, 2, 3, 4])], 2, DIMS),
    ).toThrow("expected 2 items, got 1");
  });

  it("throws when an embedding is not an array", () => {
    expect(() =>
      validateEmbeddingItems(
        [{ embedding: "not-an-array" }, vector([1, 2, 3, 4])],
        2,
        DIMS,
      ),
    ).toThrow("item missing embedding array");
  });

  it("throws when dimensions do not match", () => {
    expect(() =>
      validateEmbeddingItems([vector([1, 2]), vector([1, 2, 3, 4])], 2, DIMS),
    ).toThrow("expected 4 dims, got 2");
  });
});
