import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GRAPH_SETTINGS } from "@/lib/graph/graph-types";
import { getGraphSettings } from "./graph-cookies";

describe("getGraphSettings", () => {
  let cookieJar = "";

  beforeEach(() => {
    cookieJar = "";
    vi.stubGlobal("document", {
      get cookie() {
        return cookieJar;
      },
      set cookie(value: string) {
        const assignment = value.split(";")[0] ?? "";
        const separator = assignment.indexOf("=");
        if (separator === -1) return;
        const key = assignment.slice(0, separator);
        const storedValue = assignment.slice(separator + 1);
        if (value.includes("max-age=0")) {
          cookieJar = cookieJar
            .split("; ")
            .filter((entry) => !entry.startsWith(`${key}=`))
            .join("; ");
          return;
        }
        cookieJar = `${key}=${storedValue}`;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns defaults when no cookie is present", () => {
    expect(getGraphSettings()).toEqual(DEFAULT_GRAPH_SETTINGS);
  });

  it("merges partial cookie values over defaults", () => {
    const partial = encodeURIComponent(JSON.stringify({ showLabels: false }));
    document.cookie = `vmem-graph-settings=${partial}; path=/`;
    expect(getGraphSettings()).toEqual({
      ...DEFAULT_GRAPH_SETTINGS,
      showLabels: false,
    });
  });

  it("falls back to defaults for malformed cookie payloads", () => {
    document.cookie = "vmem-graph-settings=not-json; path=/";
    expect(getGraphSettings()).toEqual(DEFAULT_GRAPH_SETTINGS);
  });
});
