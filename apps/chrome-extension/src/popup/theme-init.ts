// Apply system theme preference before React hydrates to prevent flash.
// Lives in a module file (not inline) to satisfy the extension's
// script-src 'self' CSP.
if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
  document.documentElement.classList.add("dark");
}
