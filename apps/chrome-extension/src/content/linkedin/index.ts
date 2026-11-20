// linkedin Save on a post also saves the post; Unsave removes it.
// linkedin draws the menu outside the post, so the post is the one whose menu opened last

import type { SiteItem, SiteItemRef } from "@/lib/messaging";
import { removeSiteItem, saveSiteItem } from "@/content/shared/site-save";
import {
  MENU_BUTTON_SELECTOR,
  POST_SELECTOR,
  POST_URN,
  URN_ATTRIBUTE,
} from "./shared";

const AUTHOR_LABEL = /^Open control menu for post by (.+)$/;
const TEXT_SELECTOR = '[data-testid="expandable-text-box"]';

let openMenuButton: Element | null = null;

function refOf(button: Element): SiteItemRef {
  // a post page names its post in the address; in the feed, page-world.ts supplies it
  const urn =
    POST_URN.exec(decodeURIComponent(location.pathname))?.[0] ??
    button.getAttribute(URN_ATTRIBUTE);
  const author = AUTHOR_LABEL.exec(
    button.getAttribute("aria-label") ?? "",
  )?.[1];
  if (!urn || !author) throw new Error("Post link not found");
  return {
    source: "linkedin",
    tag: author,
    url: `https://www.linkedin.com/feed/update/${urn}/`,
  };
}

function readPost(button: Element): SiteItem {
  const ref = refOf(button);
  const text = button
    .closest(POST_SELECTOR)
    ?.querySelector<HTMLElement>(TEXT_SELECTOR)
    ?.innerText.trim();
  if (!text) throw new Error("Post text not found");
  return { ...ref, title: text, content: `Author: ${ref.tag}\n\n${text}` };
}

function syncWithSave(event: MouseEvent): void {
  if (!(event.target instanceof Element)) return;
  const menuButton = event.target.closest(MENU_BUTTON_SELECTOR);
  if (menuButton) {
    openMenuButton = menuButton;
    return;
  }
  const button = openMenuButton;
  const item = event.target.closest('[role="menuitem"]');
  if (!item || !button) return;
  const label = item.textContent?.trim().toLowerCase();
  if (label === "save") void saveSiteItem(() => readPost(button));
  else if (label === "unsave") void removeSiteItem(() => refOf(button));
}

document.addEventListener("click", syncWithSave, true);
