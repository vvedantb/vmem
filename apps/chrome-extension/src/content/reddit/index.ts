// reddit Save on a post also saves the post and its top comments; Unsave removes it.
// the post comes from reddit's own json, so only the click needs the dom

import { z } from "zod";
import { onMessage, type SiteItem, type SiteItemRef } from "@/lib/messaging";
import { removeSiteItem, saveSiteItem } from "@/content/shared/site-save";

const POST_PATH = /^\/r\/([^/]+)\/comments\/[a-z0-9]+/i;
const COMMENT_SELECTOR = "shreddit-comment, .comment";
const TOP_COMMENTS = 10;
// the menu item is a few nodes above the clicked text or icon
const LABEL_DEPTH = 6;
const SAVE_LABELS = ["save"];
const UNSAVE_LABELS = ["unsave", "remove from saved"];

const postSchema = z.object({
  title: z.string(),
  author: z.string(),
  selftext: z.string(),
  url: z.string(),
});

// a "load more" row has no body
const commentSchema = z.object({
  author: z.string().optional(),
  body: z.string().optional(),
  score: z.number().optional(),
});

const postListingSchema = z.object({
  data: z.object({ children: z.array(z.object({ data: postSchema })) }),
});

const commentListingSchema = z.object({
  data: z.object({ children: z.array(z.object({ data: commentSchema })) }),
});

const threadSchema = z.tuple([postListingSchema, commentListingSchema]);

function refOf(path: string): SiteItemRef | null {
  const subreddit = POST_PATH.exec(path)?.[1];
  if (!subreddit) return null;
  return {
    source: "reddit",
    tag: subreddit,
    url: new URL(path, "https://www.reddit.com").href,
  };
}

async function readPost(path: string): Promise<SiteItem | null> {
  const ref = refOf(path);
  if (!ref) return null;
  const response = await fetch(
    `${path.replace(/\/$/, "")}.json?sort=top&limit=${TOP_COMMENTS}&raw_json=1`,
  );
  if (!response.ok) throw new Error(`Reddit answered ${response.status}`);
  const [posts, comments] = threadSchema.parse(await response.json());
  const post = posts.data.children[0]?.data;
  if (!post) return null;
  const top = comments.data.children.flatMap(({ data }) =>
    data.body
      ? [
          `u/${data.author ?? "unknown"} (${data.score ?? 0} points):\n${data.body}`,
        ]
      : [],
  );
  const isLink = !post.url.includes(path.replace(/\/$/, ""));
  return {
    ...ref,
    title: post.title,
    content: [
      `Subreddit: r/${ref.tag}`,
      `Author: u/${post.author}`,
      ...(isLink ? [`Link: ${post.url}`] : []),
      ...(post.selftext ? ["", post.selftext] : []),
      ...(top.length > 0 ? ["", "Top comments:", top.join("\n\n")] : []),
    ].join("\n"),
  };
}

// composedPath: the menu of the new site is inside shadow dom
function elementsOf(event: MouseEvent): Element[] {
  return event
    .composedPath()
    .flatMap((node) => (node instanceof Element ? [node] : []));
}

function actionOf(path: Element[]): "save" | "unsave" | null {
  for (const el of path.slice(0, LABEL_DEPTH)) {
    // innerText: the item can also hold the hidden label of its other state
    const text = el instanceof HTMLElement ? el.innerText : el.textContent;
    const label = text?.trim().toLowerCase() ?? "";
    if (SAVE_LABELS.includes(label)) return "save";
    if (UNSAVE_LABELS.includes(label)) return "unsave";
  }
  return null;
}

// path of the post that owns the click; a click in a comment owns no post
function postPathOf(path: Element[]): string | null {
  for (const el of path) {
    if (el.matches(COMMENT_SELECTOR)) return null;
    const permalink =
      el.getAttribute("permalink") ?? el.getAttribute("data-permalink");
    if (permalink && POST_PATH.test(permalink)) return permalink;
  }
  return POST_PATH.test(location.pathname) ? location.pathname : null;
}

function syncWithSave(event: MouseEvent): void {
  const path = elementsOf(event);
  const action = actionOf(path);
  if (!action) return;
  const postPath = postPathOf(path);
  if (!postPath) return;
  if (action === "save") void saveSiteItem(() => readPost(postPath));
  else void removeSiteItem(() => refOf(postPath));
}

onMessage("siteSave", () => {
  const handled = POST_PATH.test(location.pathname);
  if (handled) void saveSiteItem(() => readPost(location.pathname));
  return { handled };
});

document.addEventListener("click", syncWithSave, true);
