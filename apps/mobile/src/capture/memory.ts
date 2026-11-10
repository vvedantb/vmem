import type { StructuredStoreBody } from "@vmem/sdk";

/** Passive captures. The backend ranks this label as low-prior. */
const ANDROID_SOURCE = "android";

interface Draft {
  title: string;
  content: string;
  tags: readonly string[];
  externalId: string;
  url?: string;
  /**
   * Intentional captures pass `android-share`, `android-note`, and so on.
   * The backend ranks those above plain `android`.
   */
  source?: string;
}

/**
 * The upload body for every Android capture. Episodic, tagged "android".
 * `source` and `sourceType` default to "android" (low-prior).
 */
export function memoryBody(draft: Draft): StructuredStoreBody {
  const source = draft.source ?? ANDROID_SOURCE;
  return {
    title: draft.title,
    content: draft.content,
    type: "episodic",
    source,
    sourceType: source,
    tags: [...new Set([ANDROID_SOURCE, ...draft.tags])],
    externalId: draft.externalId,
    ...(draft.url ? { url: draft.url } : {}),
  };
}
