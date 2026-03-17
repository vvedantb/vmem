import { createMemory } from "./api-client";
import { isCancelled, resetCancel } from "./import-cancel";

interface FlatBookmark {
  title: string;
  url: string;
  folderPath: string[];
}

function flattenBookmarks(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  path: string[] = [],
): FlatBookmark[] {
  const result: FlatBookmark[] = [];

  for (const node of nodes) {
    if (node.url) {
      result.push({ title: node.title, url: node.url, folderPath: path });
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

export async function importBookmarks(): Promise<number> {
  resetCancel();
  const tree = await chrome.bookmarks.getTree();
  const bookmarks = flattenBookmarks(tree);
  let imported = 0;

  for (const bookmark of bookmarks) {
    if (isCancelled()) break;

    try {
      await createMemory({
        title: bookmark.title || bookmark.url,
        content: `${bookmark.title}\n${bookmark.url}`,
        type: "knowledge",
        source: "bookmarks",
        tags: bookmark.folderPath,
        confidence: 0.8,
      });
      imported++;

      chrome.runtime.sendMessage({
        type: "IMPORT_PROGRESS",
        current: imported,
        total: bookmarks.length,
      });
    } catch {
      // skip failed bookmarks, continue importing
    }

    await delay(100);
  }

  return imported;
}
