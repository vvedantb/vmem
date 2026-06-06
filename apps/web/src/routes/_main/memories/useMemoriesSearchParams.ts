"use client";

import { useQueryStates } from "nuqs";
import { memoriesNuqsOptions, memoriesSearchParams } from "./-searchParams";

export function useMemoriesSearchParams() {
  return useQueryStates(memoriesSearchParams, memoriesNuqsOptions);
}
