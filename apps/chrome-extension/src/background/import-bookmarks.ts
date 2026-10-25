import { sanitizeTag } from "@vmem/shared/tags";
import { canonicalUrl } from "@vmem/shared";
import { createMemory } from "./api-client";
import { hasActiveClerkSession } from "./auth";
import { runLockedImportLoop, type ImportResult } from "./import-loop";
import { acquireBookmarkLock, releaseBookmarkLock } from "./sync-lock";
import { getSyncProfileId } from "./sync-profile";
import { getStorage, setStorage } from "@/lib/storage";
import type { CreateMemoryParams } from "@/types/api";

export type { ImportResult };

export interface FlatBookmark {
  title: string;
  url: string;
  folderPath: string[];
  dateAdded: number;
}

export function flattenBookmarks(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  path: string[] = [],
): FlatBookmark[] {
  const result: FlatBookmark[] = [];

  for (const node of nodes) {
    if (node.url) {
      result.push({
        title: node.title,
        url: node.url,
        folderPath: path,
        dateAdded: node.dateAdded ?? 0,
      });
    }
    if (node.children) {
      const childPath = node.title ? [...path, node.title] : path;
      result.push(...flattenBookmarks(node.children, childPath));
    }
  }

  return result;
}

// one row per canonical url; content skips tracking params so a re-save
// with the same title sends identical content
export function bookmarkToCreateParams(
  bookmark: Pick<FlatBookmark, "title" | "url" | "folderPath">,
  profileId: string | undefined,
): CreateMemoryParams {
  const canonical = canonicalUrl(bookmark.url);
  const title = bookmark.title.trim() || canonical;
  return {
    title,
    content: `${title}\n${canonical}`,
    type: "knowledge",
    source: "bookmarks",
    sourceType: "bookmarks",
    externalId: `bookmark|${canonical}`,
    tags: [...bookmark.folderPath, sanitizeTag(bookmark.url)],
    confidence: 0.8,
    url: bookmark.url,
    profileId,
  };
}

async function getBookmarkPath(
  bookmark: chrome.bookmarks.BookmarkTreeNode,
): Promise<string[]> {
  const path: string[] = [];
  let parentId = bookmark.parentId;

  while (parentId) {
    const [parent] = await chrome.bookmarks.get(parentId);
    if (!parent || !parent.title) break;
    path.unshift(parent.title);
    parentId = parent.parentId;
  }

  return path;
}

// import bookmarks added since last sync, first-run imports all
export async function importBookmarks(silent = false): Promise<ImportResult> {
  let profileId: string | undefined;

  return runLockedImportLoop({
    acquireLock: acquireBookmarkLock,
    releaseLock: releaseBookmarkLock,
    silent,
    persistSyncTimestamp: async () => {
      await setStorage({ lastBookmarkSync: Date.now() });
    },
    loadItems: async () => {
      const { lastBookmarkSync } = await getStorage();
      const tree = await chrome.bookmarks.getTree();
      profileId = await getSyncProfileId();
      return flattenBookmarks(tree).filter(
        (b) => b.dateAdded > lastBookmarkSync,
      );
    },
    toCreateParams: (bookmark) => bookmarkToCreateParams(bookmark, profileId),
  });
}

export async function syncSingleBookmark(
  _id: string,
  bookmark: chrome.bookmarks.BookmarkTreeNode,
): Promise<void> {
  if (!bookmark.url) return; // folders have no url

  const { autoSyncEnabled } = await getStorage();
  if (!autoSyncEnabled) return;
  if (!(await hasActiveClerkSession())) return;

  if (!acquireBookmarkLock()) return;

  try {
    const folderPath = await getBookmarkPath(bookmark);
    const profileId = await getSyncProfileId();

    await createMemory(
      bookmarkToCreateParams(
        { title: bookmark.title, url: bookmark.url, folderPath },
        profileId,
      ),
    );

    await setStorage({ lastBookmarkSync: Date.now() });
  } catch {
  } finally {
    releaseBookmarkLock();
  }
}
