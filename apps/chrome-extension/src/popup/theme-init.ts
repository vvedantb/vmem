// set dark class before react hydrates to avoid theme flash
// module file required for script-src 'self' csp
if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
  document.documentElement.classList.add("dark");
}
