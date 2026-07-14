/**
 * Readability content script.
 *
 * Lives on every page (`<all_urls>`, `document_idle`) and listens for
 * `EXTRACT_PAGE` requests sent from the background via
 * `chrome.tabs.sendMessage(tabId, { type: "EXTRACT_PAGE" })`.
 *
 * Why a content script and not `chrome.scripting.executeScript({ func })`?
 * Because `executeScript({ func })` serializes the function — its imports
 * are stripped, so `@mozilla/readability` would not be available at run
 * time. A bundled content script keeps the dependency wired up.
 *
 * The handler runs Readability on a CLONED document (Readability mutates
 * the DOM it is given — Mozilla docs are explicit on this) and falls back
 * to the previous strip-list extraction when Readability returns null
 * or an article body shorter than 200 characters (paywall, JS-heavy SPA
 * with no static HTML, etc.).
 */

import { Readability } from "@mozilla/readability";
import { z } from "zod";

const extractPageMessageSchema = z.object({
  type: z.literal("EXTRACT_PAGE"),
});

interface ExtractPageResult {
  type: "EXTRACT_PAGE_RESULT";
  title: string;
  ogTitle?: string;
  content: string;
  html: string;
  ogImage?: string;
  ogDescription?: string;
  favicon?: string;
  // True when the result came from Readability; false on fallback path
  // Lets the caller log degraded extractions for debugging
  usedReadability: boolean;
}

const FALLBACK_MIN_CHARS = 200;
const STRIP_SELECTORS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "nav",
  "footer",
  "header",
  "aside",
  "[role='banner']",
  "[role='navigation']",
  "[role='complementary']",
  "[role='contentinfo']",
  ".ad",
  ".ads",
  ".advertisement",
  "[data-ad]",
];

function readMetaContent(selector: string): string | undefined {
  const el = document.querySelector(selector);
  const v = el?.getAttribute("content");
  return v && v.length > 0 ? v : undefined;
}

function getOgMetadata(): {
  ogTitle?: string;
  ogImage?: string;
  ogDescription?: string;
  favicon?: string;
} {
  const ogTitle =
    readMetaContent('meta[property="og:title"]') ??
    readMetaContent('meta[name="og:title"]');
  const ogImage =
    readMetaContent('meta[property="og:image"]') ??
    readMetaContent('meta[name="og:image"]');
  const ogDescription =
    readMetaContent('meta[property="og:description"]') ??
    readMetaContent('meta[name="og:description"]') ??
    readMetaContent('meta[name="description"]');
  const faviconLink =
    document.querySelector('link[rel="icon"]') ??
    document.querySelector('link[rel="shortcut icon"]');
  const favicon = faviconLink?.getAttribute("href") ?? undefined;
  return { ogTitle, ogImage, ogDescription, favicon };
}

/** Strip-list extraction — used as a fallback when Readability fails. */
function fallbackExtract(): { content: string; html: string } {
  const bodyClone = document.body.cloneNode(true);
  if (!(bodyClone instanceof HTMLElement)) {
    return { content: "", html: "" };
  }
  STRIP_SELECTORS.forEach((selector) => {
    bodyClone.querySelectorAll(selector).forEach((el) => {
      el.remove();
    });
  });
  return {
    content: bodyClone.innerText.trim().slice(0, 50000),
    html: bodyClone.innerHTML,
  };
}

/** Run Readability on a cloned document. Returns null when unable to parse. */
function readabilityExtract(): { content: string; html: string } | null {
  // Readability mutates the DOM it is given — cloning is required
  // The cast is to `Document` because cloneNode returns `Node`; we know
  // `document.cloneNode(true)` always yields a Document
  const cloned = document.cloneNode(true);
  if (!(cloned instanceof Document)) return null;

  try {
    const article = new Readability(cloned).parse();
    if (!article) return null;
    const text = article.textContent.trim();
    if (text.length < FALLBACK_MIN_CHARS) return null;
    return {
      content: text.slice(0, 50000),
      html: article.content ?? "",
    };
  } catch (err) {
    console.warn("[vmem-readability] parse failed:", err);
    return null;
  }
}

function extract(): ExtractPageResult {
  const { ogTitle, ogImage, ogDescription, favicon } = getOgMetadata();
  const readabilityResult = readabilityExtract();

  if (readabilityResult) {
    return {
      type: "EXTRACT_PAGE_RESULT",
      title: ogTitle ?? document.title,
      ogTitle,
      content: readabilityResult.content,
      html: readabilityResult.html,
      ogImage,
      ogDescription,
      favicon,
      usedReadability: true,
    };
  }

  const fallback = fallbackExtract();
  return {
    type: "EXTRACT_PAGE_RESULT",
    title: ogTitle ?? document.title,
    ogTitle,
    content: fallback.content,
    html: fallback.html,
    ogImage,
    ogDescription,
    favicon,
    usedReadability: false,
  };
}

chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtractPageResult) => void,
  ) => {
    const parsed = extractPageMessageSchema.safeParse(message);
    if (!parsed.success) return false;
    try {
      sendResponse(extract());
    } catch (err) {
      console.error("[vmem-readability] extract failed:", err);
      const fallback = fallbackExtract();
      const og = getOgMetadata();
      sendResponse({
        type: "EXTRACT_PAGE_RESULT",
        title: og.ogTitle ?? document.title,
        ogTitle: og.ogTitle,
        content: fallback.content,
        html: fallback.html,
        ogImage: og.ogImage,
        ogDescription: og.ogDescription,
        favicon: og.favicon,
        usedReadability: false,
      });
    }
    return true;
  },
);

export type { ExtractPageResult };
