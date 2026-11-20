// runs in the page's own world: linkedin keeps the post id only in react data,
// and an extension script cannot read that. this script copies the id to the dom

import {
  MENU_BUTTON_SELECTOR,
  POST_SELECTOR,
  POST_URN,
  URN_ATTRIBUTE,
} from "./shared";

const MAX_DEPTH = 7;
const FIBER_PARENTS = 15;

// first post urn in a react value; react data has cycles, so seen stops loops
function findUrn(value: object, seen: Set<object>, depth = 0): string | null {
  if (depth > MAX_DEPTH || seen.has(value)) return null;
  seen.add(value);
  for (const child of Object.values(value)) {
    if (typeof child === "string") {
      const urn = POST_URN.exec(child)?.[0];
      if (urn) return urn;
    } else if (
      typeof child === "object" &&
      child !== null &&
      !(child instanceof Node) &&
      child !== window
    ) {
      const urn = findUrn(child, seen, depth + 1);
      if (urn) return urn;
    }
  }
  return null;
}

function urnOf(post: Element): string | null {
  const seen = new Set<object>();
  for (const el of [post, ...post.querySelectorAll("*")]) {
    for (const [key, value] of Object.entries(el)) {
      if (typeof value !== "object" || value === null) continue;
      if (key.startsWith("__reactProps")) {
        const urn = findUrn(value, seen);
        if (urn) return urn;
      }
      if (!key.startsWith("__reactFiber")) continue;
      let fiber = value;
      for (let i = 0; fiber && i < FIBER_PARENTS; i++, fiber = fiber.return) {
        const props = fiber.memoizedProps;
        const urn =
          typeof props === "object" && props !== null
            ? findUrn(props, seen)
            : null;
        if (urn) return urn;
      }
    }
  }
  return null;
}

function tagWithUrn(event: MouseEvent): void {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest(MENU_BUTTON_SELECTOR);
  const post = button?.closest(POST_SELECTOR);
  if (!button || !post || button.hasAttribute(URN_ATTRIBUTE)) return;
  const urn = urnOf(post);
  if (urn) button.setAttribute(URN_ATTRIBUTE, urn);
}

document.addEventListener("click", tagWithUrn, true);
