import { describe, expect, it } from "vitest";
import {
  formatTraceDuration,
  prettyTraceArgs,
  traceListFilters,
  traceToolOptions,
} from "./_tracesUtils";

describe("traceListFilters", () => {
  it("drops empty filters", () => {
    expect(traceListFilters({ tool: "", status: "all" })).toEqual({
      tool: undefined,
      ok: undefined,
    });
  });

  it("maps tool and status to listMine args", () => {
    expect(traceListFilters({ tool: "memory_retrieve", status: "ok" })).toEqual(
      { tool: "memory_retrieve", ok: true },
    );
    expect(traceListFilters({ tool: "", status: "error" })).toEqual({
      tool: undefined,
      ok: false,
    });
  });
});

describe("traceToolOptions", () => {
  it("lists unique loaded tools in order", () => {
    expect(
      traceToolOptions(
        [
          { tool: "memory_add" },
          { tool: "files_list" },
          { tool: "memory_add" },
        ],
        "",
      ),
    ).toEqual(["files_list", "memory_add"]);
  });

  it("keeps the selected tool when no row has it", () => {
    expect(traceToolOptions([], "memory_get")).toEqual(["memory_get"]);
  });
});

describe("formatTraceDuration", () => {
  it("uses ms below one second and s above", () => {
    expect(formatTraceDuration(42.4)).toBe("42 ms");
    expect(formatTraceDuration(1234)).toBe("1.23 s");
    expect(formatTraceDuration(12_345)).toBe("12.3 s");
  });
});

describe("prettyTraceArgs", () => {
  it("indents valid JSON", () => {
    expect(prettyTraceArgs('{"query":"convex","limit":5}')).toBe(
      '{\n  "query": "convex",\n  "limit": 5\n}',
    );
  });

  it("returns text that does not parse as is", () => {
    expect(prettyTraceArgs('{"query":"cut')).toBe('{"query":"cut');
  });
});
