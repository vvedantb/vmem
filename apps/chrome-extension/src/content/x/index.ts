// save button on x posts and articles; x ships two doms (legacy with data-testid, new without)

import { sendMessage } from "@/lib/messaging";
import { createVmemLogo } from "@/content/shared/icons";
import { onDocumentReady } from "@/content/shared/dom-utils";
import { checkIcon, errorIcon } from "@/content/shared/status-icons";
import { showToast } from "@/content/shared/toast";
import { errorMessage } from "@/lib/error";

type SaveState = "idle" | "saving" | "success" | "error";

type XPost = {
  url: string;
  authorName: string;
  handle: string;
  text: string;
  postedAt?: string;
  quotedText?: string;
  articleTitle?: string;
};

const BUTTON_ATTR = "data-vmem-x-save";
const LABEL = "Save to vmem";
const REPLY_SELECTOR =
  '[data-testid="reply"], [data-engagement-action="reply"]';
const SHARE_SELECTOR = '[data-engagement-action="share"]';
const TEXT_SELECTOR = '[data-testid="tweetText"], div[lang][dir="auto"]';
const ARTICLE_VIEW_SELECTOR = '[data-testid="twitterArticleReadView"]';
const ARTICLE_TITLE_SELECTOR = '[data-testid="twitter-article-title"]';
const ARTICLE_BODY_SELECTOR = '[data-testid="twitterArticleRichTextView"]';
const STATUS_PATH = /^\/([^/]+)\/status\/(\d+)$/;
const ARTICLE_PATH = /^\/([^/]+)\/article\/\d+/;
const TWITTER_EPOCH_MS = 1288834974657n;
const MAX_TEXT_LENGTH = 12000;
const FALLBACK_COLOR = "#71767b";
const STATE_COLORS = { success: "#16a34a", error: "#dc2626" };
const RESET_MS = 2000;

// nearest post or quoted-post container; a quoted post is a nested article or role=link
function ownerOf(el: Element): Element | null {
  return el.parentElement?.closest('article, [role="link"]') ?? null;
}

// text with emoji; x renders emoji as img alt
function textOf(el: Element): string {
  let out = "";
  for (const node of el.childNodes) {
    if (node instanceof HTMLImageElement) out += node.alt;
    else if (node instanceof Element) out += textOf(node);
    else out += node.textContent ?? "";
  }
  return out;
}

// ids from before snowflake (short ids) carry no time
function snowflakeDate(id: string): string | undefined {
  if (id.length < 16) return undefined;
  const ms = (BigInt(id) >> 22n) + TWITTER_EPOCH_MS;
  return new Date(Number(ms)).toISOString();
}

function readArticle(
  scope: Element,
): { articleTitle: string; text: string } | null {
  const title = scope.querySelector(ARTICLE_TITLE_SELECTOR);
  if (!title) return null;
  const body = scope.querySelector<HTMLElement>(ARTICLE_BODY_SELECTOR);
  return {
    articleTitle: textOf(title).trim(),
    text: body?.innerText.trim() ?? "",
  };
}

function findName(
  scope: Element,
  handle: string,
  owns: (el: Element) => boolean,
): string {
  const links = scope.querySelectorAll(`a[href="/${CSS.escape(handle)}"]`);
  for (const link of links) {
    const name = textOf(link).trim();
    if (owns(link) && name.length > 0 && !name.startsWith("@")) return name;
  }
  return handle;
}

function readPost(post: Element): XPost | null {
  const owns = (el: Element) => ownerOf(el) === post;
  const permalink = [
    ...post.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]'),
  ].find((a) => owns(a) && STATUS_PATH.test(new URL(a.href).pathname));
  const pathname = permalink
    ? new URL(permalink.href).pathname
    : location.pathname;
  const match = STATUS_PATH.exec(pathname);
  if (!match) return null;
  const [, handle = "", id = ""] = match;

  const texts = [...post.querySelectorAll(TEXT_SELECTOR)];
  const own = texts.find(owns);
  const quoted = texts.find((el) => !owns(el));
  const article = readArticle(post);

  return {
    url: new URL(pathname, location.origin).href,
    authorName: findName(post, handle, owns),
    handle,
    text: article?.text ?? (own ? textOf(own).trim() : ""),
    postedAt: permalink?.querySelector("time")?.dateTime || snowflakeDate(id),
    quotedText: quoted ? textOf(quoted).trim() : undefined,
    articleTitle: article?.articleTitle,
  };
}

// article page whose reader is not inside a post
function readStandaloneArticle(view: Element): XPost | null {
  const article = readArticle(view);
  const handle = ARTICLE_PATH.exec(location.pathname)?.[1];
  if (!article || !handle) return null;
  return {
    url: new URL(location.pathname, location.origin).href,
    authorName: findName(document.body, handle, () => true),
    handle,
    ...article,
  };
}

function spinner(): HTMLElement {
  const el = document.createElement("div");
  Object.assign(el.style, {
    width: "14px",
    height: "14px",
    border: "2px solid currentColor",
    borderTopColor: "transparent",
    borderRadius: "50%",
  });
  el.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], {
    duration: 600,
    iterations: Infinity,
  });
  return el;
}

function render(button: HTMLButtonElement, state: SaveState): void {
  button.dataset.state = state;
  button.style.color =
    state === "success" || state === "error"
      ? STATE_COLORS[state]
      : (button.dataset.idleColor ?? FALLBACK_COLOR);
  if (state === "idle") button.replaceChildren(createVmemLogo("current", 18));
  else if (state === "saving") button.replaceChildren(spinner());
  else button.innerHTML = state === "success" ? checkIcon(16) : errorIcon(16);
}

async function save(
  button: HTMLButtonElement,
  read: () => XPost | null,
): Promise<void> {
  if (button.dataset.state !== "idle") return;
  render(button, "saving");
  button.title = LABEL;
  try {
    const post = read();
    if (!post) throw new Error("Post not found");
    await sendMessage("saveXPost", {
      ...post,
      text: post.text.slice(0, MAX_TEXT_LENGTH),
    });
    render(button, "success");
  } catch (err) {
    const reason = errorMessage(err);
    console.error("[vmem] Failed to save X post:", reason);
    button.title = reason;
    showToast({ type: "error", message: reason });
    render(button, "error");
  }
  setTimeout(() => render(button, "idle"), RESET_MS);
}

function createButton(
  color: string,
  read: () => XPost | null,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute(BUTTON_ATTR, "");
  button.setAttribute("aria-label", LABEL);
  button.title = LABEL;
  button.dataset.idleColor = color;
  Object.assign(button.style, {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "34px",
    height: "34px",
    padding: "0",
    border: "none",
    borderRadius: "50%",
    background: "transparent",
    cursor: "pointer",
    flexShrink: "0",
  });
  render(button, "idle");
  // the post itself is a link; keep the click from opening it
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void save(button, read);
  });
  return button;
}

function injectIntoPost(post: Element): void {
  const reply = post.querySelector(REPLY_SELECTOR);
  const row = reply?.closest('[role="group"]');
  if (!reply || !row || row.querySelector(`[${BUTTON_ATTR}]`)) return;
  const icon = reply.querySelector("svg") ?? reply;
  const button = createButton(getComputedStyle(icon).color, () =>
    readPost(post),
  );
  // new dom groups bookmark and share at the row end; legacy dom is a flat row
  const share = row.querySelector(SHARE_SELECTOR);
  if (share) share.after(button);
  else row.append(button);
}

function injectIntoStandaloneArticle(view: Element): void {
  if (view.closest("article") || view.querySelector(`[${BUTTON_ATTR}]`)) return;
  const button = createButton(getComputedStyle(view).color, () =>
    readStandaloneArticle(view),
  );
  Object.assign(button.style, { display: "flex", marginLeft: "auto" });
  view.prepend(button);
}

function scan(): void {
  for (const post of document.querySelectorAll("article")) {
    // nested articles are quoted posts; they have no action row
    if (!post.parentElement?.closest("article")) injectIntoPost(post);
  }
  document
    .querySelectorAll(ARTICLE_VIEW_SELECTOR)
    .forEach(injectIntoStandaloneArticle);
}

// x is a virtualised spa: posts mount and unmount on scroll and on navigation.
// buttons live inside the post nodes, so x removes them with the post
function init(): void {
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
}

onDocumentReady(init);
