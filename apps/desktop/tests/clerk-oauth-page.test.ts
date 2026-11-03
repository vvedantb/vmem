import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { RENDERER_URL } from "../src/clerk";
import {
  SIGN_IN_PAGE_CSP,
  signInOutcome,
  signInPage,
  type SignInOutcome,
} from "../src/clerk-oauth-page";

const CALLBACK = "http://127.0.0.1:45790/sso-callback";
const OUTCOMES: SignInOutcome[] = ["success", "continue", "cancelled", "error"];

// What a reader sees: no style, script or tags.
const visibleText = (html: string): string =>
  html
    .replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("signInOutcome", () => {
  for (const [query, outcome] of [
    ["?rotating_token_nonce=abc", "success"],
    ["", "success"],
    ["?__clerk_status=verified&rotating_token_nonce=abc", "success"],
    [
      "?__clerk_status=failed&__clerk_error_code=oauth_access_denied",
      "cancelled",
    ],
    ["?error=access_denied", "cancelled"],
    [
      "?__clerk_status=failed&__clerk_error_code=external_account_not_found",
      "continue",
    ],
    [
      "?__clerk_status=failed&__clerk_error_code=external_account_exists",
      "continue",
    ],
    [
      "?__clerk_status=failed&__clerk_error_code=oauth_callback_failed",
      "error",
    ],
    ["?__clerk_status=failed", "error"],
    ["?error=server_error", "error"],
  ]) {
    it(`reads ${JSON.stringify(query)} as ${outcome}`, () => {
      assert.equal(signInOutcome(CALLBACK + query), outcome);
    });
  }

  it("treats an unreadable URL as an error", () => {
    assert.equal(signInOutcome("not a url"), "error");
  });
});

describe("signInPage", () => {
  for (const [outcome, title, text] of [
    [
      "success",
      "Signed in to vmem",
      "vmem Signed in to vmem You can go back to vmem now. Return to vmem You can close this tab.",
    ],
    [
      "continue",
      "Finish signing in to vmem",
      "vmem Almost done Go back to vmem to finish signing in. Return to vmem You can close this tab.",
    ],
    [
      "cancelled",
      "Sign-in cancelled · vmem",
      "vmem Sign-in was cancelled Go back to vmem to try again. Return to vmem You can close this tab.",
    ],
    [
      "error",
      "Sign-in did not finish · vmem",
      "vmem Sign-in did not finish Something went wrong. Go back to vmem to try again. Return to vmem You can close this tab.",
    ],
  ] satisfies [SignInOutcome, string, string][]) {
    it(`shows the ${outcome} copy`, () => {
      const html = signInPage(outcome);
      assert.ok(html.includes(`<title>${title}</title>`));
      assert.equal(visibleText(html), `${title} ${text}`);
    });
  }

  for (const outcome of OUTCOMES) {
    it(`links ${outcome} back to the settings window and tries to close the tab`, () => {
      const html = signInPage(outcome);
      assert.equal(RENDERER_URL, "vmem://renderer/");
      assert.deepEqual(html.match(/<a [^>]*>Return to vmem<\/a>/g), [
        '<a class="return" id="return" href="vmem://renderer/">Return to vmem</a>',
      ]);
      assert.ok(html.includes("window.close()"));
      assert.ok(
        html.includes('history.replaceState(null,"",location.pathname)'),
      );
    });

    it(`never names the provider, the sign-in vendor or an AI model (${outcome})`, () => {
      assert.doesNotMatch(
        signInPage(outcome),
        /clerk|google|oauth|anthropic|claude|openai|gpt|gemini|grok|llama|mistral/i,
      );
    });
  }

  it("loads nothing from the network and inlines the icon when given", () => {
    const plain = signInPage("success");
    assert.doesNotMatch(plain, /https?:\/\//);
    assert.doesNotMatch(plain, /<img|rel="icon"/);
    const withLogo = signInPage("success", 'data:image/png;base64,A"B');
    assert.ok(withLogo.includes('<img src="data:image/png;base64,A&quot;B"'));
    assert.ok(
      withLogo.includes(
        '<link rel="icon" href="data:image/png;base64,A&quot;B">',
      ),
    );
  });

  it("follows the system light or dark theme", () => {
    const html = signInPage("success");
    assert.ok(html.includes('<html lang="en-GB">'));
    assert.ok(html.includes("@media (prefers-color-scheme: dark)"));
    assert.ok(html.includes('<meta name="color-scheme" content="light dark">'));
  });
});

describe("SIGN_IN_PAGE_CSP", () => {
  it("allows exactly the page's inline script and data: images, and nothing remote", () => {
    const script =
      /<script>([\s\S]*?)<\/script>/.exec(signInPage("success"))?.[1] ?? "";
    const hash = createHash("sha256").update(script).digest("base64");
    assert.equal(
      SIGN_IN_PAGE_CSP,
      `default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${hash}'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    );
  });
});
