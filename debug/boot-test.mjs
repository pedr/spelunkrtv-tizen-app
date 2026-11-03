// Runs the boot.js flow on the TV debug page, with tvshell.js, tvfix.js and dbg.js written in inline.
// The debug page has no CSP after a reload, so inline scripts run there.
//   PC_IP=<this PC's LAN IP> node boot-test.mjs <tv-ip:inspector-port>
import { readFileSync } from "node:fs";

const hostPort = process.argv[2];
const pcIp = process.env.PC_IP;
if (!hostPort || !pcIp) {
  console.error("usage: PC_IP=<this PC's LAN IP> node boot-test.mjs <tv-ip:inspector-port>");
  process.exit(1);
}
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const inline = (code) => "<script>" + code.replace(/<\/script/gi, "<\\/script") + "</script>";
const head = '<base href="https://spelunkr.tv/">' +
  inline(`window.__DBG_SERVER = "http://${pcIp}:8765";`) +
  inline(read("./dbg.js")) + inline(read("../spelunkr-tv/tvshell.js")) + inline(read("../spelunkr-tv/tvfix.js"));

const expression = `(async () => {
  const html = await (await fetch("https://spelunkr.tv/?tv", { cache: "no-store" })).text();
  history.replaceState(null, "", "/?tv");
  const head = ${JSON.stringify(head)};
  const page = html.replace(/<head[^>]*>/i, (tag) => tag + head);
  setTimeout(() => { document.open(); document.write(page); document.close(); }, 0);
  return "booting, html " + html.length;
})()`;

const pages = await (await fetch(`http://${hostPort}/json`)).json();
const ws = new WebSocket(pages.find((p) => p.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id === 1) { console.log(JSON.stringify(msg.result?.result?.value ?? msg)); process.exit(0); }
};
ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
