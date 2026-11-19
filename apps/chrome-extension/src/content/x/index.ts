// save button on x posts and articles; x ships two doms (legacy with data-testid, new without)

import { onMessage, sendMessage } from "@/lib/messaging";
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
const LIKE_SELECTOR =
  '[data-engagement-action="like"], [data-testid="like"], [data-testid="unlike"]';
// the control that adds a bookmark; legacy dom renames it to removeBookmark when set
const ADD_BOOKMARK_SELECTOR =
  '[data-engagement-action="bookmark"] button:not([aria-pressed="true"]), [data-testid="bookmark"]';
const TEXT_SELECTOR = '[data-testid="tweetText"], div[lang][dir="auto"]';
const ARTICLE_VIEW_SELECTOR = '[data-testid="twitterArticleReadView"]';
const ARTICLE_TITLE_SELECTOR = '[data-testid="twitter-article-title"]';
const ARTICLE_BODY_SELECTOR = '[data-testid="twitterArticleRichTextView"]';
const STATUS_PATH = /^\/([^/]+)\/status\/(\d+)$/;
const ARTICLE_PATH = /^\/([^/]+)\/article\/\d+/;
const TWITTER_EPOCH_MS = 1288834974657n;
const MAX_TEXT_LENGTH = 12000;
// white disc so the button shows on x's dark and light themes
const IDLE_COLOR = "#0f1419";
const BACKGROUND = "#fff";
const IDLE_OPACITY = "0.8";
// the vmem mark is a thin outline; it needs more size than x's own icons to read as equal
const ICON_SCALE = 1.2;
const MIN_ICON_PX = 22;
// the article reader is not an icon; its width must not set the size
const MAX_ICON_PX = 28;
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
    boxSizing: "border-box",
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
    state === "success" || state === "error" ? STATE_COLORS[state] : IDLE_COLOR;
  const size = Number(button.dataset.iconSize ?? MIN_ICON_PX);
  if (state === "idle") button.replaceChildren(createVmemLogo("current", size));
  else if (state === "saving") button.replaceChildren(spinner());
  else button.innerHTML = state === "success" ? checkIcon(16) : errorIcon(16);
  // one size for every state, set as style so it wins over the svg attributes
  const icon = button.firstElementChild;
  if (icon instanceof HTMLElement || icon instanceof SVGElement) {
    const px = `${state === "idle" ? size : size - 4}px`;
    Object.assign(icon.style, { width: px, height: px });
  }
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
    const { alreadySaved } = await sendMessage("saveXPost", {
      ...post,
      text: post.text.slice(0, MAX_TEXT_LENGTH),
    });
    showToast({
      type: "success",
      message: alreadySaved ? "Already saved" : "Saved to vmem",
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
  reference: Element,
  read: () => XPost | null,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute(BUTTON_ATTR, "");
  button.setAttribute("aria-label", LABEL);
  button.title = LABEL;
  // size follows the x icon beside it (timeline and post page differ)
  const scaled = Math.round(
    reference.getBoundingClientRect().width * ICON_SCALE,
  );
  const iconSize = Math.min(Math.max(scaled, MIN_ICON_PX), MAX_ICON_PX);
  button.dataset.iconSize = String(iconSize);
  Object.assign(button.style, {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    width: `${iconSize + 10}px`,
    height: `${iconSize + 10}px`,
    padding: "0",
    border: "none",
    borderRadius: "50%",
    background: BACKGROUND,
    opacity: IDLE_OPACITY,
    transition: "opacity 150ms ease",
    cursor: "pointer",
    flexShrink: "0",
  });
  button.addEventListener("mouseenter", () => {
    button.style.opacity = "1";
  });
  button.addEventListener("mouseleave", () => {
    button.style.opacity = IDLE_OPACITY;
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
  const button = createButton(icon, () => readPost(post));
  // own slot between like and bookmark; the slot is the row child that holds like
  const likeSlot = [...row.children].find(
    (child) =>
      child.matches(LIKE_SELECTOR) || child.querySelector(LIKE_SELECTOR),
  );
  if (likeSlot) likeSlot.after(button);
  else row.append(button);
}

function injectIntoStandaloneArticle(view: Element): void {
  if (view.closest("article") || view.querySelector(`[${BUTTON_ATTR}]`)) return;
  const button = createButton(view, () => readStandaloneArticle(view));
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

function samePath(url: string): boolean {
  return (
    new URL(url).pathname.toLowerCase() === location.pathname.toLowerCase()
  );
}

// button of the post or article that the open page is about; a timeline has none
function pageButton(): HTMLButtonElement | null {
  const standalone = document.querySelector<HTMLButtonElement>(
    `${ARTICLE_VIEW_SELECTOR} > [${BUTTON_ATTR}]`,
  );
  if (standalone) return standalone;
  for (const post of document.querySelectorAll("article")) {
    const url = readPost(post)?.url;
    if (url && samePath(url)) {
      return post.querySelector<HTMLButtonElement>(`[${BUTTON_ATTR}]`);
    }
  }
  return null;
}

onMessage("siteSave", () => {
  const button = pageButton();
  button?.click();
  return { handled: button !== null };
});

// a new bookmark also saves the post; removing a bookmark does nothing
function saveOnBookmark(event: MouseEvent): void {
  if (!(event.target instanceof Element)) return;
  if (!event.target.closest(ADD_BOOKMARK_SELECTOR)) return;
  event.target
    .closest("article")
    ?.querySelector<HTMLButtonElement>(`[${BUTTON_ATTR}]`)
    ?.click();
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
  document.addEventListener("click", saveOnBookmark, true);
  scan();
}

onDocumentReady(init);
