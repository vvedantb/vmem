/**
 * LIVE end-to-end verification of the YouTube "Save to vmem" button.
 *
 * Loads the built extension into real headless Edge, opens a real YouTube
 * watch page, clicks the injected vmem button, and asserts — by hooking
 * chrome.runtime.sendMessage inside the content script's isolated world —
 * that the SAVE_YOUTUBE_VIDEO message carries an actual transcript extracted
 * from YouTube's transcript panel (timedtext is dead: it 200s with an empty
 * body unless the request carries a BotGuard proof-of-origin token).
 *
 * Run: node scripts/yt-verify.mjs [videoId]
 */
import { spawn, execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const WebSocket = require("ws");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DIST = join(process.cwd(), "dist");
const PORT = 9241;
const PROFILE = mkdtempSync(join(tmpdir(), "vmemytv-"));
const VIDEO_ID = process.argv[2] || "jNQXAC9IVRw"; // "Me at the zoo" — has captions

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const httpJson = async (p) => (await fetch(`http://127.0.0.1:${PORT}${p}`)).json();

class CDP {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.p = new Map(); this.events = []; this.open = new Promise((res, rej) => { this.ws.on("open", res); this.ws.on("error", rej); }); this.ws.on("message", (d) => { const m = JSON.parse(d.toString()); if (m.id && this.p.has(m.id)) { const { resolve, reject } = this.p.get(m.id); this.p.delete(m.id); if (m.error) { reject(new Error(JSON.stringify(m.error))); } else { resolve(m.result); } } else if (m.method) { this.events.push(m); } }); }
  send(method, params = {}) { const id = ++this.id; return new Promise((resolve, reject) => { this.p.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async evaluate(expression, contextId) { const params = { expression, awaitPromise: true, returnByValue: true }; if (contextId) params.contextId = contextId; const r = await this.send("Runtime.evaluate", params); if (r.exceptionDetails) throw new Error("eval: " + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails)); return r.result.value; }
  close() { try { this.ws.close(); } catch {} }
}

function launchEdge() {
  return spawn(EDGE, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, `--load-extension=${DIST}`, "--no-first-run", "--no-default-browser-check", "--window-size=1400,1000", "--lang=en-US"], { stdio: ["ignore", "ignore", "ignore"] });
}
function killEdge() {
  const ps = `
    $ErrorActionPreference='SilentlyContinue'
    $ids = New-Object System.Collections.Generic.List[int]
    try { foreach ($c in Get-NetTCPConnection -LocalPort ${PORT} -State Listen) { $ids.Add([int]$c.OwningProcess) } } catch {}
    foreach ($p in Get-CimInstance Win32_Process -Filter "Name='msedge.exe'") { if ($p.CommandLine -like '*vmemytv-*') { $ids.Add([int]$p.ProcessId) } }
    foreach ($id in ($ids | Sort-Object -Unique)) { try { taskkill /F /T /PID $id | Out-Null } catch {} }
  `;
  const b64 = Buffer.from(ps, "utf16le").toString("base64");
  try { execSync(`powershell -NoProfile -EncodedCommand ${b64}`, { stdio: "ignore" }); } catch {}
}

async function waitVersion() { for (let i = 0; i < 80; i++) { try { const v = await httpJson("/json/version"); if (v) return v; } catch {} await sleep(250); } throw new Error("Edge devtools endpoint never came up"); }

const results = [];
const check = (name, pass, detail) => { results.push({ pass }); console.log(`${pass ? "  ✓ PASS" : "  ✗ FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); };

async function main() {
  console.log("\n=== LIVE YouTube save-button verification ===\n");
  console.log("[1] Launching headless Edge with the built extension…");
  launchEdge();
  await waitVersion();

  const ver = await httpJson("/json/version");
  const browser = new CDP(ver.webSocketDebuggerUrl); await browser.open;
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  await sleep(500);
  const page = (await httpJson("/json")).find((t) => t.id === targetId);
  if (!page) throw new Error("page target not found");
  const cdp = new CDP(page.webSocketDebuggerUrl); await cdp.open;
  // Enable Runtime BEFORE navigating so we capture isolated-world contexts.
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.send("Page.navigate", { url: `https://www.youtube.com/watch?v=${VIDEO_ID}` });
  console.log("[2] Waiting for watch page + content script…");
  await sleep(12000);

  // The extension's isolated world (named after the extension) — always take
  // the LATEST one; YouTube reloads can tear down earlier contexts.
  const latestIsolated = () => {
    const contexts = cdp.events
      .filter((e) => e.method === "Runtime.executionContextCreated")
      .map((e) => e.params.context)
      .filter((c) => c.auxData && c.auxData.isDefault === false && /chrome-extension/.test(c.origin || c.name || ""));
    return contexts[contexts.length - 1];
  };
  check("content-script isolated world found", !!latestIsolated(), latestIsolated() ? `name=${latestIsolated().name}` : "none");
  if (!latestIsolated()) throw new Error("no isolated world — content script did not run?");

  let buttonPresent = false;
  for (let i = 0; i < 30 && !buttonPresent; i++) {
    buttonPresent = await cdp.evaluate(`!!document.getElementById("vmem-youtube-save")`);
    if (!buttonPresent) await sleep(1000);
  }
  check("vmem save button injected", buttonPresent);
  if (!buttonPresent) throw new Error("button missing");
  const isolated = latestIsolated();

  // Hook sendMessage in the isolated world to capture the outgoing payload.
  await cdp.evaluate(`(() => {
    globalThis.__vmemSent = [];
    const orig = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = (msg, cb) => { globalThis.__vmemSent.push(msg); return orig(msg, cb); };
    return true;
  })()`, isolated.id);

  console.log("[3] Clicking the vmem save button…");
  await cdp.evaluate(`document.getElementById("vmem-youtube-save").click()`);

  // Wait for the content script to extract the transcript and send the message.
  let sent = [];
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    sent = await cdp.evaluate(`globalThis.__vmemSent || []`, isolated.id);
    if (sent.length > 0) break;
  }
  const save = sent.find((m) => m && m.type === "SAVE_YOUTUBE_VIDEO");
  check("SAVE_YOUTUBE_VIDEO message sent", !!save);
  if (save) {
    check("title extracted", typeof save.title === "string" && save.title.length > 0, `title="${save.title}"`);
    check("channel extracted", typeof save.channel === "string" && save.channel !== "Unknown Channel", `channel="${save.channel}"`);
    const hasTranscript = typeof save.transcript === "string" && save.transcript.length > 20 && save.transcript !== "(No transcript available)";
    check("transcript actually extracted (panel path)", hasTranscript, hasTranscript ? `${save.transcript.length} chars: "${save.transcript.slice(0, 80)}…"` : `transcript="${String(save.transcript).slice(0, 60)}"`);
  }

  // The panel we opened should be closed again (no expanded transcript panel).
  const panelExpanded = await cdp.evaluate(`(() => {
    return [...document.querySelectorAll("ytd-engagement-panel-section-list-renderer")]
      .some((p) => (p.getAttribute("target-id") || "").toLowerCase().includes("transcript") && p.getAttribute("visibility") === "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED");
  })()`);
  check("transcript panel closed after extraction", !panelExpanded);

  // Round-trip: background responded (save fails on auth in this fresh
  // profile, but a "Failed/Saved" state proves messaging + handler ran).
  const buttonState = await cdp.evaluate(`(() => { const b = document.getElementById("vmem-youtube-save"); return { html: b.innerHTML.slice(0, 120), title: b.title }; })()`);
  console.log("    button after click:", JSON.stringify(buttonState));

  cdp.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n=== ${results.length - failed}/${results.length} checks passed ===`);
  return failed === 0;
}

main().then((ok) => { killEdge(); try { rmSync(PROFILE, { recursive: true, force: true }); } catch {} process.exit(ok ? 0 : 1); })
  .catch((err) => { console.log("\nVERIFY ERROR:", err && err.message ? err.message : err); killEdge(); try { rmSync(PROFILE, { recursive: true, force: true }); } catch {} process.exit(2); });
