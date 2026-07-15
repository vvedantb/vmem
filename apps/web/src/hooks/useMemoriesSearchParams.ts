import { useQueryStates } from "nuqs";
import {
  memoriesNuqsOptions,
  memoriesSearchParams,
} from "@/lib/url-state/memories";

export function useMemoriesSearchParams() {
  return useQueryStates(memoriesSearchParams, memoriesNuqsOptions);
}
