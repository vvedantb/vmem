import { savePageFromTab } from "./context-menu";

async function triggerScreenshot(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "START_SCREENSHOT" });
  } catch (err) {
    console.warn("[vmem] Could not start screenshot on tab:", err);
  }
}

export function registerCommandListener(): void {
  chrome.commands.onCommand.addListener((command) => {
    void handleCommand(command);
  });
}

export async function handleCommand(command: string): Promise<void> {
  if (command === "take-screenshot") {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) return;
    await triggerScreenshot(tab.id);
    return;
  }

  if (command === "save-page") {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id || !tab.url) return;

    console.log("[vmem] Keyboard shortcut: saving page", tab.url);
    const tabId = tab.id;

    try {
      await savePageFromTab(tab);
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
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
            color: "#4ade80",
            padding: "10px 18px",
            borderRadius: "10px",
            fontFamily:
              "'Instrument Sans', system-ui, -apple-system, sans-serif",
            fontSize: "13px",
            fontWeight: "500",
            zIndex: "2147483647",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            opacity: "0",
            transform: "translateY(8px)",
            transition: "opacity 200ms ease, transform 200ms ease",
          });
          el.textContent = "✓ Page saved to vmem";
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
      });
    } catch (err) {
      console.error("[vmem] Keyboard shortcut save failed:", err);
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
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
              color: "#f87171",
              padding: "10px 18px",
              borderRadius: "10px",
              fontFamily:
                "'Instrument Sans', system-ui, -apple-system, sans-serif",
              fontSize: "13px",
              fontWeight: "500",
              zIndex: "2147483647",
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
              opacity: "0",
              transform: "translateY(8px)",
              transition: "opacity 200ms ease, transform 200ms ease",
            });
            el.textContent = "✗ Failed to save page";
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
        });
      } catch {
        // Tab may have navigated away
      }
    }
  }
}
