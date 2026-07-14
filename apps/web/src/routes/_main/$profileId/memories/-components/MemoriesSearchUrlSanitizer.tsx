"use client";

import { useLayoutEffect, useRef } from "react";
import { useSearch } from "@tanstack/react-router";
import {
  isNullishQueryValue,
  type MemoriesSearchParams,
} from "../-searchParams";
import { useMemoriesSearchParams } from "../useMemoriesSearchParams";

function nonEmptyLegacyString(
  routeSearch: unknown,
  key: "tag" | "source",
): string | null {
  if (typeof routeSearch !== "object" || routeSearch === null) return null;

  let raw: unknown;
  if (key === "tag") {
    if (!("tag" in routeSearch)) return null;
    raw = routeSearch.tag;
  } else {
    if (!("source" in routeSearch)) return null;
    raw = routeSearch.source;
  }

  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildUrlCleanupPatch(
  search: URLSearchParams,
  params: MemoriesSearchParams,
  routeSearch: unknown,
): Partial<MemoriesSearchParams> | null {
  const patch: Partial<MemoriesSearchParams> = {};

  if (params.focus !== null && isNullishQueryValue(params.focus)) {
    patch.focus = null;
  }

  const arrayKeys = ["tags", "sources", "types", "kinds"] as const;
  for (const key of arrayKeys) {
    const raw = search.get(key);
    if (raw !== null && isNullishQueryValue(raw)) {
      patch[key] = [];
    }
  }

  const rawQ = search.get("q");
  if (rawQ !== null && isNullishQueryValue(rawQ)) {
    patch.q = "";
  }

  const rawView = search.get("view");
  if (rawView !== null && isNullishQueryValue(rawView)) {
    patch.view = "memories";
  }

  // legacy ?tag= / ?source= → plural nuqs keys
  if (params.tags.length === 0) {
    const tag = nonEmptyLegacyString(routeSearch, "tag");
    if (tag !== null) patch.tags = [tag.toLowerCase()];
  }
  if (params.sources.length === 0) {
    const source = nonEmptyLegacyString(routeSearch, "source");
    if (source !== null) patch.sources = [source];
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

// one-shot rewrite for malformed / legacy query strings
export function MemoriesSearchUrlSanitizer() {
  const [params, setParams] = useMemoriesSearchParams();
  const routeSearch = useSearch({ strict: false });
  const didRun = useRef(false);

  useLayoutEffect(() => {
    if (didRun.current) return;

    const patch = buildUrlCleanupPatch(
      new URLSearchParams(window.location.search),
      params,
      routeSearch,
    );
    if (patch === null) return;

    didRun.current = true;
    void setParams(patch);
  }, [params, setParams, routeSearch]);

  return null;
}
