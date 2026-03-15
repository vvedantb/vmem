export function waitForElement(
  selector: string,
  timeout = 10000,
): Promise<Element | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

export function observeUrlChanges(callback: () => void): void {
  let currentUrl = location.href;

  const observer = new MutationObserver(() => {
    if (location.href !== currentUrl) {
      currentUrl = location.href;
      callback();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("popstate", callback);
}
