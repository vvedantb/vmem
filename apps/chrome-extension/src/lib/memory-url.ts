import { CLERK_SYNC_HOST } from "./constants";

// web page of one saved memory; without a profile the web app redirects to the active workspace.
// a skipped save has no id, so it has no page
export function memoryWebUrl(memory: {
  id: string;
  profileId?: string | null;
}): string | undefined {
  if (memory.id.length === 0) return undefined;
  const workspace = memory.profileId ? `/${memory.profileId}` : "";
  return `${CLERK_SYNC_HOST}${workspace}/memories/list/${memory.id}`;
}
