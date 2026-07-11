/**
 * LIVE end-to-end verification of the auto-sync watchdog in a REAL browser.
 *
 * Loads the built extension into real headless Edge (branded Google Chrome
 * blocks --load-extension; Edge — same Chromium engine, same MV3/alarms — does
 * not) and drives it via the DevTools Protocol from the extension's own page
 * context (which exposes the full chrome.* APIs; alarms + storage are shared
 * with the service worker). No mocks: real chrome.alarms, real chrome.storage,
 * a real browser kill + relaunch.
 *
 * Proves, against a live browser:
 *   1. SW boots to bootstrap-ready and schedules BOTH periodic alarms.
 *   2. Running the new build (SW_BUILD_STAMP).
 *   3. A real sync attempt records lastSyncAttemptAt + lastSyncSkipReason
 *      (the diagnostics that make a silent 12-day gap impossible).
 *   4. After dropping the history alarm and a REAL browser kill+relaunch, the
 *      alarm is restored — auto-sync survives crash/restart and self-heals.
 *
 * Run: node scripts/live-verify.mjs
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
const PORT = 9224;
const PROFILE = mkdtempSync(join(tmpdir(), "vmemlive-"));
const HISTORY = "vmem-history-sync";
const HEARTBEAT = "vmem-user-settings-mirror";
const STAMP = "static-sw-20260612-per-browser-profile";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// AbortSignal.timeout: a half-killed browser can leave the port open but
// unresponsive — without it, one hung fetch wedges the whole harness.
const httpJson = async (p) => (await fetch(`http://127.0.0.1:${PORT}${p}`, { signal: AbortSignal.timeout(10_000) })).json();
const isOurSw = (t) => t.type === "service_worker" && /background\.js/.test(t.url);

class CDP {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.p = new Map(); this.open = new Promise((res, rej) => { this.ws.on("open", res); this.ws.on("error", rej); }); this.ws.on("message", (d) => { const m = JSON.parse(d.toString()); if (m.id && this.p.has(m.id)) { const { resolve, reject } = this.p.get(m.id); this.p.delete(m.id); if (m.error) { reject(new Error(JSON.stringify(m.error))); } else { resolve(m.result); } } }); }
  // 30s cap per CDP call: an evaluate whose promise never settles (e.g. a
  // sendMessage the SW never answers) must fail the run, not hang it forever.
  send(method, params = {}) { const id = ++this.id; return new Promise((resolve, reject) => { this.p.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (this.p.has(id)) { this.p.delete(id); reject(new Error(`CDP timeout: ${method}`)); } }, 30_000); }); }
  async evaluate(expression) { const r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error("eval: " + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails)); return r.result.value; }
  close() { try { this.ws.close(); } catch {} }
}

function launchEdge() {
  return spawn(EDGE, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, `--load-extension=${DIST}`, "--no-first-run", "--no-default-browser-check"], { stdio: ["ignore", "ignore", "ignore"] });
}
function killEdge() {
  // Kill ONLY this test's Edge — never the user's. Target the process that owns
  // our debug port (its whole tree) plus any msedge whose command line carries
  // our unique profile dir. Edge re-parents and CommandLine can be null, so we
  // use both signals. Encoded command avoids cmd/PowerShell quoting hell.
  const ps = `
    $ErrorActionPreference='SilentlyContinue'
    $ids = New-Object System.Collections.Generic.List[int]
    try { foreach ($c in Get-NetTCPConnection -LocalPort ${PORT} -State Listen) { $ids.Add([int]$c.OwningProcess) } } catch {}
    foreach ($p in Get-CimInstance Win32_Process -Filter "Name='msedge.exe'") { if ($p.CommandLine -like '*vmemlive-*') { $ids.Add([int]$p.ProcessId) } }
    foreach ($id in ($ids | Sort-Object -Unique)) { try { taskkill /F /T /PID $id | Out-Null } catch {} }
  `;
  const b64 = Buffer.from(ps, "utf16le").toString("base64");
  try { execSync(`powershell -NoProfile -EncodedCommand ${b64}`, { stdio: "ignore" }); } catch {}
}

// Confirm the browser is actually GONE (devtools endpoint refuses connections)
// — otherwise a "relaunch" would just reattach to the same running instance and
// the restart would be fake.
async function waitEndpointDown(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { await httpJson("/json/version"); } catch { return true; }
    await sleep(300);
  }
  return false;
}

async function waitVersion() { for (let i = 0; i < 80; i++) { try { const v = await httpJson("/json/version"); if (v) return v; } catch {} await sleep(250); } throw new Error("Edge devtools endpoint never came up"); }
async function findSw(timeoutMs) { const start = Date.now(); while (Date.now() - start < timeoutMs) { try { const sw = (await httpJson("/json")).find(isOurSw); if (sw && sw.webSocketDebuggerUrl) return sw; } catch {} await sleep(150); } return null; }

// Open the extension's welcome page (full chrome.* APIs) and return a CDP session to it.
async function openExtensionPage(extId) {
  const ver = await httpJson("/json/version");
  const browser = new CDP(ver.webSocketDebuggerUrl); await browser.open;
  const { targetId } = await browser.send("Target.createTarget", { url: `chrome-extension://${extId}/welcome.html` });
  await sleep(900);
  const page = (await httpJson("/json")).find((t) => t.id === targetId);
  browser.close();
  if (!page || !page.webSocketDebuggerUrl) throw new Error("welcome page target not found");
  const cdp = new CDP(page.webSocketDebuggerUrl); await cdp.open; await cdp.send("Runtime.enable");
  // Sanity: the page context must expose extension APIs.
  const ok = await cdp.evaluate(`(() => typeof chrome !== 'undefined' && !!chrome.alarms && !!chrome.storage)()`);
  if (!ok) throw new Error("extension page lacks chrome.alarms/storage");
  return cdp;
}

const getAlarms = (cdp) => cdp.evaluate(`(async () => (await chrome.alarms.getAll()).map(a => a.name).sort())()`);
const getLocal = (cdp, keys) => cdp.evaluate(`(async () => await chrome.storage.local.get(${JSON.stringify(keys)}))()`);

const results = [];
const check = (name, pass, detail) => { results.push({ pass }); console.log(`${pass ? "  ✓ PASS" : "  ✗ FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); };

async function main() {
  console.log("\n=== LIVE browser verification (real MV3 service worker, real alarms) ===\n");

  // ── Launch #1 ──
  console.log("[1] Launching real headless Edge with the built extension…");
  launchEdge();
  const ver = await waitVersion();
  console.log(`    Browser: ${ver.Browser}`);
  const sw = await findSw(15000);
  check("extension service worker is LIVE in a real browser", !!sw, sw ? sw.url : "no SW target");
  if (!sw) throw new Error("our service worker never appeared");
  const extId = new URL(sw.url).host;

  let page = await openExtensionPage(extId);

  const boot = await getLocal(page, { vmemSwBootPhase: "", vmemSwBuildStamp: "" });
  check("SW reached bootstrap-ready", boot.vmemSwBootPhase === "bootstrap-ready", `phase=${boot.vmemSwBootPhase}`);
  check("running the new build", boot.vmemSwBuildStamp === STAMP, `stamp=${boot.vmemSwBuildStamp}`);

  const alarms1 = await getAlarms(page);
  check("BOTH periodic alarms scheduled (always active)", alarms1.includes(HISTORY) && alarms1.includes(HEARTBEAT), `[${alarms1.join(", ")}]`);

  // ── Real sync attempt → diagnostics recorded ──
  console.log("[2] Firing a real sync attempt (DEBUG_RUN_AUTO_SYNC) and reading diagnostics…");
  const bootAt1 = (await getLocal(page, { vmemSwBootAt: 0 })).vmemSwBootAt;
  await page.evaluate(`(async () => { try { await chrome.runtime.sendMessage({ type: 'DEBUG_RUN_AUTO_SYNC' }); } catch (e) {} })()`);
  let diag = { lastSyncAttemptAt: 0, lastSyncSkipReason: "" };
  for (let i = 0; i < 25; i++) { diag = await getLocal(page, { lastSyncAttemptAt: 0, lastSyncSkipReason: "" }); if (diag.lastSyncAttemptAt > 0) break; await sleep(400); }
  check("every attempt records lastSyncAttemptAt (no silent gap)", typeof diag.lastSyncAttemptAt === "number" && diag.lastSyncAttemptAt > 0, `attemptAt=${diag.lastSyncAttemptAt}, skipReason="${diag.lastSyncSkipReason}"`);

  // ── Persistence across a REAL browser kill + relaunch ──
  console.log("[3] Killing + relaunching the browser (alarms must persist)…");
  page.close();
  killEdge();
  const wentDown = await waitEndpointDown();
  check("browser fully terminated (real restart, not a reattach)", wentDown, wentDown ? "devtools endpoint down" : "STILL UP — kill failed");
  await sleep(1500);
  console.log("    Browser killed. Relaunching the same profile…");
  launchEdge();
  await waitVersion();
  await findSw(20000);
  page = await openExtensionPage(extId);
  // Alarms are persisted to the profile by Chrome, so they survive the restart
  // independently of when the (event-driven) worker next wakes.
  let alarms2 = await getAlarms(page);
  for (let i = 0; i < 15 && !(alarms2.includes(HISTORY) && alarms2.includes(HEARTBEAT)); i++) { await sleep(400); alarms2 = await getAlarms(page); }
  check("both alarms present after restart (survives crash/restart)", alarms2.includes(HISTORY) && alarms2.includes(HEARTBEAT), `[${alarms2.join(", ")}]`);

  // ── Watchdog self-heal in the LIVE worker: drop history alarm, fire heartbeat ──
  console.log("[4] Dropping the history alarm, then firing the heartbeat to self-heal it…");
  await page.evaluate(`(async () => { await chrome.alarms.clear('${HISTORY}'); })()`);
  const afterClear = await getAlarms(page);
  check("history alarm dropped (simulated Chrome eviction)", !afterClear.includes(HISTORY), `[${afterClear.join(", ")}]`);
  // Schedule the heartbeat alarm to fire ASAP; when it fires the real SW cold-boots
  // and runs handleHeartbeat → startAutoSync, which must recreate the history alarm.
  await page.evaluate(`(async () => { await chrome.alarms.create('${HEARTBEAT}', { when: Date.now() + 1000, periodInMinutes: 1 }); })()`);
  console.log("    Waiting for the heartbeat alarm to fire (Chrome clamps first fire to ~30–60s)…");
  let healed = [];
  for (let i = 0; i < 160; i++) { healed = await getAlarms(page); if (healed.includes(HISTORY)) break; await sleep(1000); }
  check("history alarm SELF-HEALED by the live heartbeat watchdog", healed.includes(HISTORY), `[${healed.join(", ")}]`);
  // The heartbeat firing means the worker cold-booted in the relaunched browser —
  // verify a fresh boot (bootAt advanced past launch #1) and re-bootstrap.
  const bootAt2 = (await getLocal(page, { vmemSwBootAt: 0 })).vmemSwBootAt;
  check("service worker cold-booted in the relaunched browser (fresh bootstrap ran)", bootAt2 > bootAt1, `bootAt ${bootAt1} → ${bootAt2}`);
  page.close();

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n=== ${results.length - failed}/${results.length} LIVE checks passed ===`);
  return failed === 0;
}

main().then((ok) => { killEdge(); try { rmSync(PROFILE, { recursive: true, force: true }); } catch {} process.exit(ok ? 0 : 1); })
  .catch((err) => { console.log("\nLIVE VERIFY ERROR:", err && err.message ? err.message : err); killEdge(); try { rmSync(PROFILE, { recursive: true, force: true }); } catch {} process.exit(2); });
