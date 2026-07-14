import { createMemory } from "./api-client";
import { hasActiveClerkSession } from "./auth";
import { runLockedImportLoop, type ImportResult } from "./import-loop";
import { acquireBookmarkLock, releaseBookmarkLock } from "./sync-lock";
import { getSyncProfileId } from "./sync-profile";
import { getStorage, setStorage } from "@/lib/storage";

export type { ImportResult };

interface FlatBookmark {
  title: string;
  url: string;
  folderPath: string[];
  dateAdded: number;
}

function flattenBookmarks(
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

/** Walk up the bookmark tree to build the folder path for a single bookmark. */
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

/**
 * Bulk import bookmarks — only imports items added since last sync.
 * First run (lastBookmarkSync === 0) imports everything.
 */
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
      // This browser's workspace selection (see sync-profile.ts).
      profileId = await getSyncProfileId();
      return flattenBookmarks(tree).filter(
        (b) => b.dateAdded > lastBookmarkSync,
      );
    },
    toCreateParams: (bookmark) => ({
      title: bookmark.title || bookmark.url,
      content: `${bookmark.title}\n${bookmark.url}`,
      type: "knowledge",
      source: "bookmarks",
      tags: bookmark.folderPath,
      confidence: 0.8,
      url: bookmark.url,
      profileId,
    }),
  });
}

/**
 * Sync a single newly-created bookmark (called from chrome.bookmarks.onCreated).
 * Skips if auto-sync disabled, not logged in, is a folder, or lock is held.
 */
export async function syncSingleBookmark(
  _id: string,
  bookmark: chrome.bookmarks.BookmarkTreeNode,
): Promise<void> {
  if (!bookmark.url) return; // folders have no URL

  const { autoSyncEnabled } = await getStorage();
  if (!autoSyncEnabled) return;
  if (!(await hasActiveClerkSession())) return;

  if (!acquireBookmarkLock()) return;

  try {
    const folderPath = await getBookmarkPath(bookmark);
    const profileId = await getSyncProfileId();

    await createMemory({
      title: bookmark.title || bookmark.url,
      content: `${bookmark.title}\n${bookmark.url}`,
      type: "knowledge",
      source: "bookmarks",
      tags: folderPath,
      confidence: 0.8,
      url: bookmark.url,
      profileId,
    });

    await setStorage({ lastBookmarkSync: Date.now() });
  } catch {
  } finally {
    releaseBookmarkLock();
  }
}
