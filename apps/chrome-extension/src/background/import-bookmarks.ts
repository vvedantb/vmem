import { createMemory } from "./api-client";
import { hasActiveClerkSession } from "./auth";
import { isCancelled, resetCancel } from "./import-cancel";
import { acquireBookmarkLock, releaseBookmarkLock } from "./sync-lock";
import { getSyncProfileId } from "./sync-profile";
import { getStorage, setStorage } from "@/lib/storage";

interface FlatBookmark {
  title: string;
  url: string;
  folderPath: string[];
  dateAdded: number;
}

export interface ImportResult {
  imported: number;
  locked: boolean;
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  if (!acquireBookmarkLock()) {
    return { imported: 0, locked: true };
  }

  try {
    resetCancel();
    const { lastBookmarkSync } = await getStorage();
    const tree = await chrome.bookmarks.getTree();
    const allBookmarks = flattenBookmarks(tree);

    // Incremental: only bookmarks added since last sync
    const bookmarks = allBookmarks.filter(
      (b) => b.dateAdded > lastBookmarkSync,
    );

    // This browser's workspace selection (see sync-profile.ts).
    const profileId = await getSyncProfileId();

    let imported = 0;
    let processed = 0;

    for (const bookmark of bookmarks) {
      if (isCancelled()) break;

      try {
        const result = await createMemory({
          title: bookmark.title || bookmark.url,
          content: `${bookmark.title}\n${bookmark.url}`,
          type: "knowledge",
          source: "bookmarks",
          tags: bookmark.folderPath,
          confidence: 0.8,
          url: bookmark.url,
          profileId,
        });

        processed++;
        if (result.status === "created") {
          imported++;
        }

        if (!silent) {
          chrome.runtime.sendMessage({
            type: "IMPORT_PROGRESS",
            current: processed,
            total: bookmarks.length,
          });
        }
      } catch {
        // skip failed bookmarks, continue importing
      }

      await delay(100);
    }

    return { imported, locked: false };
  } finally {
    if (!isCancelled()) {
      await setStorage({ lastBookmarkSync: Date.now() });
    }
    releaseBookmarkLock();
  }
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
