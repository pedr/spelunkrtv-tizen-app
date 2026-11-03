// Minimal Chrome DevTools Protocol client for the TV inspector (Node 22+).
//   node cdp.mjs <host:port> eval "<expression>"     evaluate in the page and print the result
//   node cdp.mjs <host:port> watch <seconds>         print console, exceptions, network and load events
//   node cdp.mjs <host:port> screenshot <file.png>
import { writeFileSync } from "node:fs";

const [hostPort, action, arg] = process.argv.slice(2);
const pages = await (await fetch(`http://${hostPort}/json`)).json();
const page = pages.find((p) => p.type === "page") || pages[0];
console.log("page:", page.title, page.url);
const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const short = (s, n = 300) => String(s).slice(0, n);

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    return msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
  }
  const p = msg.params || {};
  switch (msg.method) {
    case "Runtime.consoleAPICalled":
      console.log(`[console.${p.type}]`, p.args.map((a) => short(a.value ?? a.description ?? a.type, 400)).join(" "));
      break;
    case "Runtime.exceptionThrown":
      console.log("[exception]", short(p.exceptionDetails.exception?.description || p.exceptionDetails.text, 800));
      break;
    case "Log.entryAdded":
      console.log(`[log.${p.entry.level}]`, short(p.entry.text, 400), p.entry.url ? short(p.entry.url, 120) : "");
      break;
    case "Network.requestWillBeSent":
      console.log("[req]", p.request.method, short(p.request.url, 160));
      break;
    case "Network.responseReceived":
      console.log("[res]", p.response.status, short(p.response.url, 160));
      break;
    case "Network.loadingFailed":
      console.log("[fail]", p.errorText, p.blockedReason || "", p.corsErrorStatus ? JSON.stringify(p.corsErrorStatus) : "");
      break;
    case "Page.frameNavigated":
      if (!p.frame.parentId) console.log("[nav]", short(p.frame.url, 160));
      break;
    case "Page.loadEventFired":
      console.log("[load]");
      break;
  }
};

await new Promise((r) => (ws.onopen = r));
if (action === "eval") {
  const res = await call("Runtime.evaluate", { expression: arg, returnByValue: true, awaitPromise: true });
  console.log(res.exceptionDetails ? "EXCEPTION " + JSON.stringify(res.exceptionDetails) : JSON.stringify(res.result.value ?? res.result.description, null, 1));
  process.exit(0);
} else if (action === "watch") {
  await Promise.all(["Runtime.enable", "Log.enable", "Network.enable", "Page.enable"].map((m) => call(m)));
  setTimeout(() => process.exit(0), Number(arg || 20) * 1000);
} else if (action === "screenshot") {
  await call("Page.enable");
  const res = await call("Page.captureScreenshot", { format: "png" });
  writeFileSync(arg, Buffer.from(res.data, "base64"));
  console.log("saved", arg);
  process.exit(0);
}
