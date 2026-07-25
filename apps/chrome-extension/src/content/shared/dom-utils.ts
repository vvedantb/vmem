export function waitForProbe<T>(
  probe: () => T | null | undefined,
  timeout = 10000,
): Promise<T | null> {
  return new Promise((resolve) => {
    const existing = probe();
    if (existing != null) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const found = probe();
      if (found != null) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(found);
      }
    });

    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(probe() ?? null);
    }, timeout);

    observer.observe(document.body, { childList: true, subtree: true });
  });
}

export function waitForElement(
  selector: string,
  timeout = 10000,
): Promise<Element | null> {
  return waitForProbe(() => document.querySelector(selector), timeout);
}

export function observeUrlChanges(callback: () => void): void {
  let currentUrl = location.href;

  const check = (): void => {
    if (location.href !== currentUrl) {
      currentUrl = location.href;
      callback();
    }
  };

  const observer = new MutationObserver(check);

  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("popstate", check);
  window.addEventListener("hashchange", check);
}

// run fn once the document is ready to receive dom mutations safe to call
// even if the content script was injected after load already happened
export function onDocumentReady(fn: () => void): void {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn);
  } else {
    fn();
  }
}

// fixed full viewport pointer events none shadow host used by every
// content script overlay caller still owns appending host to the document
export function createShadowHost(
  tag: string,
  css: string,
  zIndex = "2147483647",
): { host: HTMLElement; shadow: ShadowRoot } {
  const host = document.createElement(tag);
  Object.assign(host.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "0",
    height: "0",
    overflow: "visible",
    zIndex,
    pointerEvents: "none",
  });

  const shadow = host.attachShadow({ mode: "closed" });

  const styleEl = document.createElement("style");
  styleEl.textContent = css;
  shadow.appendChild(styleEl);

  return { host, shadow };
}
