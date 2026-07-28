import { describe, expect, it } from "vitest";
import { DECLARED_DDL_NAMES } from "../../engine/neo4j/setup";

// declared ddl names drive setup completion checks
// if a statement stops yielding a name the check silently skips it
// new indexes then never reach existing databases, which this test prevents
describe("DECLARED_DDL_NAMES", () => {
  it("names every setup statement exactly once", () => {
    expect(new Set(DECLARED_DDL_NAMES).size).toBe(DECLARED_DDL_NAMES.length);
    expect(DECLARED_DDL_NAMES.every((name) => name.length > 0)).toBe(true);
  });

  it("covers the indexes the query layer depends on", () => {
    expect(DECLARED_DDL_NAMES).toEqual(
      expect.arrayContaining([
        "memory_id",
        "memory_content",
        "memory_embedding",
        // team scope matches on profile-id alone
        "memory_profile_id",
        "chunk_content",
        "chunk_embedding",
        "entity_user_name",
        "code_symbol_search",
      ]),
    );
  });
});
