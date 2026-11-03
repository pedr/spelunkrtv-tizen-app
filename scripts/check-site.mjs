// Checks from a PC that spelunkr.tv still behaves the way the TV app depends on (Node 18+).
//   node scripts/check-site.mjs
// Exit code 1 when a check fails. See README.md, "When spelunkr.tv changes".
const SITE = "https://spelunkr.tv/";
// A stable Prelinger Archives item, used to check the archive.org metadata API.
const ARCHIVE_ITEM = "SellingA1938";

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failed++;
}

// The app page is file:///index.html, so its requests send "Origin: null".
async function get(url) {
  const res = await fetch(url, { headers: { Origin: "null" }, cache: "no-store" });
  return { res, text: await res.text() };
}
function allowsApp(res) {
  const value = res.headers.get("access-control-allow-origin");
  return value === "*" || value === "null";
}

// boot.js reads the HTML cross-origin and writes it into the app page after <head>.
const html = await get(SITE + "?tv");
check("HTML answers 200", html.res.status === 200, `status ${html.res.status}`);
check("HTML allows cross-origin reads", allowsApp(html.res),
  `Access-Control-Allow-Origin: ${html.res.headers.get("access-control-allow-origin")}`);
check("HTML has a <head> tag", /<head[^>]*>/i.test(html.text));

const bundlePath = (html.text.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/i) || [])[1];
check("HTML loads a module bundle", !!bundlePath, bundlePath || "no <script type=\"module\" src>");
if (bundlePath) {
  const bundle = await get(new URL(bundlePath, SITE).href);
  const js = bundle.text;
  check("bundle allows cross-origin reads", allowsApp(bundle.res));
  // tvfix.js rewrites only this URL form.
  check("bundle builds archive.org/download URLs", js.includes("https://archive.org/download/"));
  // The site's own TV mode: layout and remote keys.
  check("bundle has the ?tv mode", js.includes("[?&]tv(=|&|$)"));

  // Outside spelunkr.tv the site reads its data from Supabase storage.
  const supabase = (js.match(/https:\/\/[a-z0-9]+\.supabase\.co/) || [])[0];
  check("bundle has a Supabase URL", !!supabase, supabase || "");
  check("bundle reads Supabase storage outside spelunkr.tv", js.includes("/storage/v1/object/public/broadcast/"));
  if (supabase) {
    const lineup = await get(`${supabase}/storage/v1/object/public/broadcast/lineup.json`);
    let channels = 0;
    try { channels = JSON.parse(lineup.text).channels.length; } catch {}
    check("Supabase lineup.json loads cross-origin", lineup.res.status === 200 && allowsApp(lineup.res) && channels > 0,
      `${channels} channels`);
  }
}

// tvfix.js builds the storage-server URL from this API.
const meta = await get(`https://archive.org/metadata/${ARCHIVE_ITEM}`);
let location = null;
try {
  const m = JSON.parse(meta.text);
  const alt = m.alternate_locations && m.alternate_locations.servers && m.alternate_locations.servers[0];
  const server = (alt && alt.server) || m.server || m.d1;
  const dir = (alt && alt.dir) || m.dir;
  if (server && dir) location = `https://${server}${dir}/`;
} catch {}
check("archive.org metadata API allows cross-origin reads", allowsApp(meta.res));
check("archive.org metadata gives a server and dir", !!location, location || "");

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
