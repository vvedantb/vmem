// bundled content-script keeps @mozilla/readability available, executeScript cannot
// handles extractPage from background, clones dom because readability mutates it
// falls back to strip list when readability returns null or very short text

import { Readability } from "@mozilla/readability";
import { onMessage, type ExtractPageData } from "@/lib/messaging";

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

function readabilityExtract(): { content: string; html: string } | null {
  // readability mutates the dom, clone before parsing
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

function extract(): ExtractPageData {
  const { ogTitle, ogImage, ogDescription, favicon } = getOgMetadata();
  const readabilityResult = readabilityExtract();

  if (readabilityResult) {
    return {
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

onMessage("extractPage", () => {
  try {
    return extract();
  } catch (err) {
    console.error("[vmem-readability] extract failed:", err);
    const fallback = fallbackExtract();
    const og = getOgMetadata();
    return {
      title: og.ogTitle ?? document.title,
      ogTitle: og.ogTitle,
      content: fallback.content,
      html: fallback.html,
      ogImage: og.ogImage,
      ogDescription: og.ogDescription,
      favicon: og.favicon,
      usedReadability: false,
    };
  }
});
