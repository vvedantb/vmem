export function connectorCallbackHtml(
  error: string | null,
  connectorId: string | null,
  frontendUrl: string,
): string {
  const success = error === null;
  const message = success
    ? "Connected successfully! You can close this window."
    : `Connection failed: ${error}`;

  return `<!DOCTYPE html>
<html>
<head>
  <title>${success ? "Connected" : "Connection Failed"}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .container {
      text-align: center;
      padding: 2rem;
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .icon {
      font-size: 48px;
      margin-bottom: 1rem;
    }
    .message {
      color: #333;
      margin-bottom: 1rem;
    }
    .hint {
      color: #666;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${success ? "✓" : "✗"}</div>
    <p class="message">${message}</p>
    <p class="hint">This window will close automatically...</p>
  </div>
  <script>
    (function() {
      const payload = {
        type: "connector-oauth-complete",
        success: ${success},
        connectorId: ${connectorId ? `"${connectorId}"` : "null"},
        error: ${error ? `"${error}"` : "null"}
      };

      if (window.opener) {
        try {
          window.opener.postMessage(payload, "${frontendUrl}");
        } catch (e) {
          console.error("postMessage failed:", e);
        }
        try {
          window.opener.postMessage(payload, "*");
        } catch (e2) {
          console.error("postMessage wildcard failed:", e2);
        }
      } else {
        console.error("No window.opener - popup may have been opened in new tab");
        document.querySelector('.hint').textContent = "Please close this window and check the main app.";
      }

      setTimeout(() => window.close(), 1500);
    })();
  </script>
</body>
</html>`;
}
