// toast after keyboard-shortcut save
export async function injectPageToast(
  tabId: number,
  message: string,
  color: string,
): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    // injected function only receives explicit args
    func: (toastMessage: string, toastColor: string) => {
      const el = document.createElement("div");
      Object.assign(el.style, {
        position: "fixed",
        top: "24px",
        right: "24px",
        // close to @vvedantb/ui tokens.color.fill.dark, which only ships in the react barrel
        background: "rgba(24,24,28,0.95)",
        backdropFilter: "blur(16px)",
        color: toastColor,
        padding: "10px 18px",
        borderRadius: "10px",
        // no webfont fetch from the host page, instrument sans only if installed
        fontFamily: "'Instrument Sans', system-ui, -apple-system, sans-serif",
        fontSize: "13px",
        fontWeight: "500",
        zIndex: "2147483647",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        opacity: "0",
        transform: "translateY(-8px)",
        transition: "opacity 200ms ease, transform 200ms ease",
      });
      el.textContent = toastMessage;
      document.documentElement.appendChild(el);
      requestAnimationFrame(() => {
        el.style.opacity = "1";
        el.style.transform = "translateY(0)";
      });
      setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translateY(-8px)";
        setTimeout(() => el.remove(), 200);
      }, 2500);
    },
    args: [message, color],
  });
}
