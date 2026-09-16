// ChatGPT / Claude fixture HTML gets export and use-vmem controls
// AI-generated (Claude), prompt: "happy-dom tests for vmem chatgpt and claude inject buttons"
// Modified by me: platform selectors, duplicate inject is a no-op, empty use-vmem copy
import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { installChromeMock } from "./helpers/chrome-mock.mts";
import { SELECTORS as CHATGPT_SELECTORS } from "../src/content/chatgpt/selectors.ts";
import { SELECTORS as CLAUDE_SELECTORS } from "../src/content/claude/selectors.ts";
import { EXPORT_PROMPT } from "../src/lib/constants.ts";

installChromeMock();

const chatgptFixture = `<!doctype html>
<html>
  <body>
    <header>
      <div class="flex items-center gap-2"></div>
    </header>
    <div class="composer">
      <div id="prompt-textarea" contenteditable="true"></div>
      <button data-testid="send-button">Send</button>
    </div>
  </body>
</html>`;

const claudeFixture = `<!doctype html>
<html>
  <body>
    <header>
      <div class="flex items-center"></div>
    </header>
    <div class="composer">
      <div contenteditable="true"></div>
      <button data-testid="send-button">Send</button>
    </div>
  </body>
</html>`;

function installDom(html: string, url: string): void {
  const happy = new Window({ url });
  Object.assign(globalThis, {
    window: happy,
    document: happy.document,
    HTMLElement: happy.HTMLElement,
    HTMLButtonElement: happy.HTMLButtonElement,
    MutationObserver: happy.MutationObserver,
    Node: happy.Node,
    Event: happy.Event,
  });
  happy.document.write(html);
}

const { injectExportButton } =
  await import("../src/content/shared/inject-export.ts");
const { injectUseVmemButton } =
  await import("../src/content/shared/inject-use-vmem.ts");
const { setInputText } =
  await import("../src/content/shared/set-input-text.ts");
const { formatMemoriesContext } =
  await import("../src/content/shared/format-memories-context.ts");

await test("ChatGPT fixture injects export and use-vmem controls", async () => {
  installDom(chatgptFixture, "https://chatgpt.com/");
  await injectExportButton({
    headerSelector: CHATGPT_SELECTORS.headerActions,
    inputSelector: CHATGPT_SELECTORS.inputField,
    focus: "before",
  });
  await injectUseVmemButton({
    inputSelector: CHATGPT_SELECTORS.inputField,
    focus: "before",
  });

  const exportBtn = document.querySelector("[data-vmem-action='export']");
  const useBtn = document.querySelector("[data-vmem]");
  assert.ok(exportBtn, "export control is in the ChatGPT header");
  assert.ok(useBtn, "use-vmem control is next to the ChatGPT input");
  assert.match(exportBtn?.textContent ?? "", /Export to vmem/);
});

await test("ChatGPT export click writes the shared export prompt into the input", async () => {
  installDom(chatgptFixture, "https://chatgpt.com/");
  await injectExportButton({
    headerSelector: CHATGPT_SELECTORS.headerActions,
    inputSelector: CHATGPT_SELECTORS.inputField,
    focus: "before",
  });
  const exportBtn = document.querySelector("[data-vmem-action='export']");
  assert.ok(exportBtn instanceof HTMLElement);
  exportBtn.click();
  const input = document.querySelector(CHATGPT_SELECTORS.inputField);
  assert.equal(input?.textContent, EXPORT_PROMPT);
});

await test("duplicate ChatGPT inject is a no-op", async () => {
  installDom(chatgptFixture, "https://chatgpt.com/");
  await injectExportButton({
    headerSelector: CHATGPT_SELECTORS.headerActions,
    inputSelector: CHATGPT_SELECTORS.inputField,
    focus: "before",
  });
  await injectExportButton({
    headerSelector: CHATGPT_SELECTORS.headerActions,
    inputSelector: CHATGPT_SELECTORS.inputField,
    focus: "before",
  });
  assert.equal(
    document.querySelectorAll("[data-vmem-action='export']").length,
    1,
  );
});

await test("Claude fixture injects export and use-vmem controls", async () => {
  installDom(claudeFixture, "https://claude.ai/");
  await injectExportButton({
    headerSelector: CLAUDE_SELECTORS.headerActions,
    inputSelector: CLAUDE_SELECTORS.inputField,
    focus: "after",
  });
  await injectUseVmemButton({
    inputSelector: CLAUDE_SELECTORS.inputField,
    focus: "after",
  });
  assert.ok(document.querySelector("[data-vmem-action='export']"));
  assert.ok(
    document.querySelector("[aria-label='Use vmem']") ??
      document.querySelector("[title='Use vmem']"),
  );
});

await test("Use vmem with an empty input asks the user to type first", async () => {
  installDom(chatgptFixture, "https://chatgpt.com/");
  await injectUseVmemButton({
    inputSelector: CHATGPT_SELECTORS.inputField,
    focus: "before",
  });
  const button = document.querySelector("[data-vmem]");
  assert.ok(button instanceof HTMLButtonElement);
  button.click();
  assert.equal(button.getAttribute("aria-label"), "Type a message first");
});

await test("setInputText honors before vs after focus order", () => {
  installDom(chatgptFixture, "https://chatgpt.com/");
  const input = document.querySelector(CHATGPT_SELECTORS.inputField);
  assert.ok(input instanceof HTMLElement);
  setInputText(input, "hello", "before");
  assert.equal(input.textContent, "hello");
  setInputText(input, "world", "after");
  assert.equal(input.textContent, "world");
});

await test("formatMemoriesContext prefixes retrieved memories for the composer", () => {
  assert.equal(formatMemoriesContext([]), "");
  const text = formatMemoriesContext([
    {
      title: "Prefers TypeScript",
      content: "User writes TS",
    },
  ]);
  assert.match(text, /\[Context from vmem\]/);
  assert.match(text, /Prefers TypeScript/);
});
