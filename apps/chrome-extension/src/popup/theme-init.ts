// apply system theme preference before react hydrates to prevent flash
// lives in a module file (not inline) to satisfy the extension's
// script-src 'self' csp
if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
  document.documentElement.classList.add("dark");
}
