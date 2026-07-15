// show a short toast in the active tab after a keyboard shortcut save
export async function injectPageToast(
  tabId: number,
  message: string,
  color: string,
): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    // serialized into the page no outer scope captures besides args
    func: (toastMessage: string, toastColor: string) => {
      if (!document.getElementById("vmem-instrument-sans-font")) {
        const link = document.createElement("link");
        link.id = "vmem-instrument-sans-font";
        link.rel = "stylesheet";
        link.href =
          "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap";
        document.head.appendChild(link);
      }
      const el = document.createElement("div");
      Object.assign(el.style, {
        position: "fixed",
        bottom: "24px",
        right: "24px",
        background: "rgba(24,24,28,0.95)",
        backdropFilter: "blur(16px)",
        color: toastColor,
        padding: "10px 18px",
        borderRadius: "10px",
        fontFamily: "'Instrument Sans', system-ui, -apple-system, sans-serif",
        fontSize: "13px",
        fontWeight: "500",
        zIndex: "2147483647",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        opacity: "0",
        transform: "translateY(8px)",
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
        el.style.transform = "translateY(8px)";
        setTimeout(() => el.remove(), 200);
      }, 2500);
    },
    args: [message, color],
  });
}
