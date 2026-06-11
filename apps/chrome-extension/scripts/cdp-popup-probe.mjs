// Throwaway diagnostic: drive the sandboxed Chrome (port 9233) over CDP to
// inspect the extension popup's scroll behaviour. Not part of the build.
import WebSocket from "ws";

const PORT = 9233;
const EXT_ID = "hfaodjnaaonolnefgbfnjaoidbdkgoca";
const POPUP_URL = `chrome-extension://${EXT_ID}/popup/index.html`;

function rpc(ws) {
  let id = 0;
  const pending = new Map();
  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  return (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params, sessionId }));
    });
}

async function connect(url) {
  const ws = new WebSocket(url, { perMessageDeflate: false });
  await new Promise((res, rej) => {
    ws.on("open", res);
    ws.on("error", rej);
  });
  return ws;
}

const targets = await fetch(`http://localhost:${PORT}/json/list`).then((r) =>
  r.json(),
);
const page = targets.find((t) => t.type === "page");
if (!page) throw new Error("no page target");

const ws = await connect(page.webSocketDebuggerUrl);
const send = rpc(ws);

await send("Page.enable");
await send("Page.navigate", { url: POPUP_URL });
await new Promise((r) => setTimeout(r, 4000));

const evalJs = async (expr) => {
  const res = await send("Runtime.evaluate", {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails)
    throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result.value;
};

const report = await evalJs(`(() => {
  const html = document.documentElement;
  const out = {
    url: location.href,
    dpr: window.devicePixelRatio,
    inner: [window.innerWidth, window.innerHeight],
    htmlClient: [html.clientWidth, html.clientHeight],
    htmlScroll: [html.scrollWidth, html.scrollHeight],
    htmlOverflow: getComputedStyle(html).overflow,
    bodyOverflow: getComputedStyle(document.body).overflow,
    windowScrollbarWidth: window.innerWidth - html.clientWidth,
    scrollers: [],
  };
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    const canScroll = /(auto|scroll)/.test(cs.overflowY + cs.overflowX);
    const overflows =
      el.scrollHeight > el.clientHeight + 1 ||
      el.scrollWidth > el.clientWidth + 1;
    if (canScroll || overflows) {
      out.scrollers.push({
        tag: el.tagName,
        cls: String(el.className).slice(0, 90),
        overflowY: cs.overflowY,
        client: [el.clientWidth, el.clientHeight],
        scroll: [el.scrollWidth, el.scrollHeight],
        offsetMinusClientW: el.offsetWidth - el.clientWidth,
        scrollbarGutter: cs.scrollbarGutter,
        scrollbarWidthProp: cs.scrollbarWidth,
      });
    }
  }
  return out;
})()`);

console.log(JSON.stringify(report, null, 2));
ws.close();
