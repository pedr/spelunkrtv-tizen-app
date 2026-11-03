// Samsung TV remote API over WebSocket (Node 22+). The first use shows an "Allow" prompt on the TV.
//   node tv-remote.mjs <tv-ip> browser <url>
//   node tv-remote.mjs <tv-ip> key KEY_ENTER
import { readFileSync, writeFileSync } from "node:fs";

const [ip, action, arg] = process.argv.slice(2);
const tokenFile = new URL("./.tv-token", import.meta.url);
let token = "";
try { token = readFileSync(tokenFile, "utf8").trim(); } catch {}

const name = Buffer.from("SpelunkrDebug").toString("base64");
const url = `wss://${ip}:8002/api/v2/channels/samsung.remote.control?name=${name}` + (token ? `&token=${token}` : "");
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // the TV uses a self-signed certificate
const ws = new WebSocket(url);
const done = (code) => { try { ws.close(); } catch {} setTimeout(() => process.exit(code), 300); };
setTimeout(() => { console.log("timeout (accept the prompt on the TV?)"); done(2); }, 120000);

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  console.log("<-", JSON.stringify(msg).slice(0, 300));
  if (msg.event === "ms.channel.connect") {
    if (msg.data && msg.data.token) writeFileSync(tokenFile, String(msg.data.token));
    if (action === "browser") {
      ws.send(JSON.stringify({ method: "ms.channel.emit", params: { event: "ed.apps.launch", to: "host",
        data: { appId: "org.tizen.browser", action_type: "NATIVE_LAUNCH", metaTag: arg } } }));
    } else if (action === "key") {
      ws.send(JSON.stringify({ method: "ms.remote.control", params: { Cmd: "Click", DataOfCmd: arg, Option: "false", TypeOfRemote: "SendRemoteKey" } }));
      setTimeout(() => done(0), 1000);
    }
  } else if (msg.event === "ed.apps.launch") {
    done(0);
  } else if (msg.event === "ms.channel.unauthorized") {
    done(1);
  }
};
ws.onerror = (e) => { console.log("ws error", e.message || e); done(1); };
