import type { StructuredStoreBody } from "@vmem/sdk";

const ANDROID_SOURCE = "android";

interface Draft {
  title: string;
  content: string;
  tags: readonly string[];
  externalId: string;
  url?: string;
}

/**
 * The upload body for every Android capture. Same shape as the desktop
 * recorder (`source` and `sourceType` "android", episodic, tagged
 * "android"), so the backend ranks it as a low-prior source.
 */
export function memoryBody(draft: Draft): StructuredStoreBody {
  return {
    title: draft.title,
    content: draft.content,
    type: "episodic",
    source: ANDROID_SOURCE,
    sourceType: ANDROID_SOURCE,
    tags: [...new Set([ANDROID_SOURCE, ...draft.tags])],
    externalId: draft.externalId,
    ...(draft.url ? { url: draft.url } : {}),
  };
}
