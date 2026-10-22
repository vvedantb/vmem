import type { FunctionReturnType } from "convex/server";
import type { ArtifactStateStore, ArtifactVersionSummary } from "@vvedantb/ui";
import type { ArtifactStateMap } from "@vvedantb/server";
import type { api } from "@vmem/backend";

export type ArtifactRef = FunctionReturnType<
  typeof api.artifacts.api.refs
>[number];

type ArtifactHistory = FunctionReturnType<typeof api.artifacts.api.history>;

// vmem state for one artifact behind the ArtifactFrame adapter. `save` gets
// the whole map, so it resets and writes it in one putState call.
export function createArtifactStateStore(deps: {
  load: () => Promise<{ data: ArtifactStateMap } | null>;
  put: (patch: {
    sets: ArtifactStateMap;
    reset: true;
  }) => Promise<{ data: ArtifactStateMap }>;
  onError: ArtifactStateStore["onError"];
}): ArtifactStateStore {
  return {
    load: async () => (await deps.load())?.data ?? {},
    save: async (data) => {
      await deps.put({ sets: data, reset: true });
    },
    onError: deps.onError,
  };
}

// versions menu rows; a title shows only when it differs from the current one
export function toVersionSummaries(
  history: ArtifactHistory,
  currentTitle: string,
): ArtifactVersionSummary[] {
  return history.map((row) => ({
    version: row.version,
    createdAt: row.createdAt,
    title: row.title === currentTitle ? undefined : row.title,
  }));
}

const REF_KIND_LABELS: Record<ArtifactRef["kind"], string> = {
  memory: "Memory",
  file: "File",
  source: "Source",
  skill: "Skill",
  app: "App",
};

export function artifactRefLabel(ref: Pick<ArtifactRef, "kind">): string {
  return REF_KIND_LABELS[ref.kind];
}

// memory refs first (they link to the memory), then the rest by kind
export function sortArtifactRefs(refs: readonly ArtifactRef[]): ArtifactRef[] {
  const order = Object.keys(REF_KIND_LABELS);
  return [...refs].sort(
    (a, b) =>
      order.indexOf(a.kind) - order.indexOf(b.kind) ||
      b.createdAt - a.createdAt,
  );
}
