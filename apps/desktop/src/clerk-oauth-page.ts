import { createHash } from "node:crypto";
import { RENDERER_URL } from "./clerk";

// The page the system browser shows when social sign-in ends (clerk-oauth-loopback.ts). No text here may name the
// identity provider, the sign-in vendor or any AI model: users only see vmem. Ported from Bee.

export type SignInOutcome = "success" | "continue" | "cancelled" | "error";

// Sign-in and sign-up hand over to each other on these codes; the user finishes in the app.
const TRANSFER_CODES = new Set([
  "external_account_not_found",
  "external_account_exists",
]);

/** How sign-in ended, read from the query of the URL the browser came back to. */
export function signInOutcome(callbackUrl: string): SignInOutcome {
  let params: URLSearchParams;
  try {
    params = new URL(callbackUrl).searchParams;
  } catch {
    return "error";
  }
  if (params.get("__clerk_status") === "failed") {
    const code = params.get("__clerk_error_code") ?? "";
    if (code === "oauth_access_denied") return "cancelled";
    return TRANSFER_CODES.has(code) ? "continue" : "error";
  }
  const error = params.get("error");
  if (error) return error === "access_denied" ? "cancelled" : "error";
  return "success";
}

const COPY: Record<
  SignInOutcome,
  { title: string; heading: string; detail: string }
> = {
  success: {
    title: "Signed in to vmem",
    heading: "Signed in to vmem",
    detail: "You can go back to vmem now.",
  },
  continue: {
    title: "Finish signing in to vmem",
    heading: "Almost done",
    detail: "Go back to vmem to finish signing in.",
  },
  cancelled: {
    title: "Sign-in cancelled · vmem",
    heading: "Sign-in was cancelled",
    detail: "Go back to vmem to try again.",
  },
  error: {
    title: "Sign-in did not finish · vmem",
    heading: "Sign-in did not finish",
    detail: "Something went wrong. Go back to vmem to try again.",
  },
};

// Removes the one-time sign-in values from the address bar and history. A script can only close a tab that it
// opened, so the close after "Return to vmem" is best effort.
const SCRIPT =
  'history.replaceState(null,"",location.pathname);' +
  'document.getElementById("return").addEventListener("click",function(){setTimeout(function(){window.close()},500)});';

/** Sent as a header with every page: inline styles, the hashed script and data: images only. */
export const SIGN_IN_PAGE_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  `script-src 'sha256-${createHash("sha256").update(SCRIPT).digest("base64")}'`,
  "img-src data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const STYLE = `
:root {
  color-scheme: light dark;
  --page: #f5f5f4;
  --card: #ffffff;
  --text: #111111;
  --muted: #5f5f5f;
  --border: #e4e4e2;
  --accent: #111111;
  --on-accent: #ffffff;
}
@media (prefers-color-scheme: dark) {
  :root {
    --page: #0b0b0b;
    --card: #151515;
    --text: #f2f2f2;
    --muted: #a3a3a3;
    --border: #2a2a2a;
    --accent: #f2f2f2;
    --on-accent: #111111;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 24px;
  background: var(--page);
  color: var(--text);
  font: 400 16px/1.5 "Instrument Sans", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}
main {
  width: 100%;
  max-width: 400px;
  padding: 36px 32px 28px;
  border: 1px solid var(--border);
  border-radius: 28px;
  background: var(--card);
  text-align: center;
}
.brand { display: inline-flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 600; }
.brand img { width: 40px; height: 40px; border-radius: 10px; }
h1 { margin: 22px 0 6px; font-size: 26px; font-weight: 600; line-height: 1.2; text-wrap: balance; }
p { margin: 0; color: var(--muted); text-wrap: pretty; }
.return {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  margin-top: 26px;
  padding: 0 26px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--on-accent);
  font-weight: 600;
  text-decoration: none;
}
.return:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.hint { margin-top: 14px; font-size: 13px; }
`;

function attribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

/**
 * The whole page. It reflects nothing from the request, so only our own values need escaping.
 * `logo` is a data: URL of the app icon; without it the page shows the name only.
 */
export function signInPage(outcome: SignInOutcome, logo?: string): string {
  const copy = COPY[outcome];
  const image =
    logo === undefined
      ? ""
      : `<img src="${attribute(logo)}" alt="" width="40" height="40">`;
  const icon =
    logo === undefined ? "" : `<link rel="icon" href="${attribute(logo)}">`;
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="referrer" content="no-referrer">
<title>${copy.title}</title>
${icon}
<style>${STYLE}</style>
</head>
<body>
<main>
<div class="brand">${image}vmem</div>
<h1>${copy.heading}</h1>
<p>${copy.detail}</p>
<a class="return" id="return" href="${RENDERER_URL}">Return to vmem</a>
<p class="hint">You can close this tab.</p>
</main>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
