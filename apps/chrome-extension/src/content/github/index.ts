// a github Star also saves the repo (name, description, readme); Unstar removes it

import { onMessage, type SiteItem, type SiteItemRef } from "@/lib/messaging";
import { removeSiteItem, saveSiteItem } from "@/content/shared/site-save";

const REPO_META = 'meta[name="octolytics-dimension-repository_nwo"]';
// react header button, then the form buttons of the older header
const STAR_SELECTOR =
  'button[data-testid="star-button"], form.unstarred button, form.starred button';
const README_SELECTOR = "article.markdown-body";
// github adds this to the description of every repo page
const DESCRIPTION_SUFFIX =
  /\s*(- [\w.-]+\/[\w.-]+|Contribute to .* on GitHub\.)$/;

function metaContent(selector: string): string {
  return document.querySelector<HTMLMetaElement>(selector)?.content ?? "";
}

// owner/repo of the open page; empty when the page is not in a repo
function repoName(): string {
  return metaContent(REPO_META);
}

function refOf(name: string): SiteItemRef | null {
  const [owner] = name.split("/");
  if (!owner) return null;
  return {
    source: "github",
    tag: owner,
    url: new URL(name, "https://github.com").href,
  };
}

// the readme is in the page on the repo home only; public repos also serve it raw
async function readReadme(name: string): Promise<string> {
  const inPage = document.querySelector<HTMLElement>(README_SELECTOR);
  if (inPage) return inPage.innerText.trim();
  try {
    const response = await fetch(
      `https://raw.githubusercontent.com/${name}/HEAD/README.md`,
    );
    return response.ok ? (await response.text()).trim() : "";
  } catch {
    return "";
  }
}

async function readRepo(name: string): Promise<SiteItem | null> {
  const ref = refOf(name);
  if (!ref) return null;
  const description = metaContent('meta[name="description"]')
    .replace(DESCRIPTION_SUFFIX, "")
    .trim();
  const readme = await readReadme(name);
  return {
    ...ref,
    title: name,
    content: [
      `Repository: ${name}`,
      ...(description ? [description] : []),
      ...(readme ? ["", "README:", readme] : []),
    ].join("\n"),
  };
}

function syncWithStar(event: MouseEvent): void {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest("button");
  const name = repoName();
  if (!button || !name) return;
  // the react header asks to confirm an unstar; the repo leaves the list on that click
  const confirmsUnstar =
    button.closest('[role="dialog"]') !== null &&
    button.textContent?.trim() === "Unstar";
  if (confirmsUnstar) {
    void removeSiteItem(() => refOf(name));
    return;
  }
  if (!button.matches(STAR_SELECTOR)) return;
  const label = button.getAttribute("aria-label") ?? "";
  if (label.startsWith("Star")) void saveSiteItem(() => readRepo(name));
  else if (button.closest("form.starred"))
    void removeSiteItem(() => refOf(name));
}

// the save shortcut saves the repo on its home page; other repo pages save as pages
onMessage("siteSave", () => {
  const name = repoName();
  const handled =
    name !== "" &&
    location.pathname.replace(/\/$/, "").toLowerCase() ===
      `/${name.toLowerCase()}`;
  if (handled) void saveSiteItem(() => readRepo(name));
  return { handled };
});

document.addEventListener("click", syncWithStar, true);
