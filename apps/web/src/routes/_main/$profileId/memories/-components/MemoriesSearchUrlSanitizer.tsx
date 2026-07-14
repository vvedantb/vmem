"use client";

import { useLayoutEffect, useRef } from "react";
import {
  isNullishQueryValue,
  type MemoriesSearchParams,
} from "../-searchParams";
import { useMemoriesSearchParams } from "../useMemoriesSearchParams";

function buildUrlCleanupPatch(
  search: URLSearchParams,
  params: MemoriesSearchParams,
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

  return Object.keys(patch).length > 0 ? patch : null;
}

// one-shot rewrite for malformed query strings (legacy tab links that passed parsed
export function MemoriesSearchUrlSanitizer() {
  const [params, setParams] = useMemoriesSearchParams();
  const didRun = useRef(false);

  useLayoutEffect(() => {
    if (didRun.current) return;

    const patch = buildUrlCleanupPatch(
      new URLSearchParams(window.location.search),
      params,
    );
    if (patch === null) return;

    didRun.current = true;
    void setParams(patch);
  }, [params, setParams]);

  return null;
}
