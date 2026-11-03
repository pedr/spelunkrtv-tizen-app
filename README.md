# Spelunkr TV for Samsung Tizen

A Samsung Tizen TV app that runs https://spelunkr.tv/ with the TV remote.

This is an unofficial personal project. It is not made by spelunkr.tv or Samsung, and they do not support it. The app contains no code from spelunkr.tv. It downloads the site at runtime, the same way a browser does.

Tested on a Samsung CU8000 50" (2023, Tizen 9.0, Chromium 120, user agent `SMART-TV; LINUX; Tizen 9.0`).

## Folder layout

| Path | Content |
|---|---|
| `spelunkr-tv/` | The app. Each file goes into the package. |
| `spelunkr-tv/boot.js` | Loads the site HTML and writes it into the app page, with the fix scripts first. |
| `spelunkr-tv/tvfix.js` | Changes archive.org video URLs to the direct storage-server URL. This is the video fix. |
| `spelunkr-tv/tvshell.js` | Makes the site work inside the app page: history paths, reload guard, remote keys. |
| `scripts/check-site.mjs` | Checks from a PC that spelunkr.tv still behaves the way the app needs. |
| `debug/` | Debug tools: inspector client, `sdb` client, log server and proxy, test scripts. |
| `dist/` | Built `.wgt` packages (not in git). |

## How the app works

1. The TV opens `index.html` (`file:///index.html`).
2. `boot.js` downloads `https://spelunkr.tv/?tv`. The site sends `Access-Control-Allow-Origin: *`, so the app can read it.
3. `boot.js` changes the page path to `/?tv` with `history.replaceState`. The site routes on `location.pathname`.
4. `boot.js` adds `<base href="https://spelunkr.tv/">`, `tvshell.js`, and `tvfix.js` to the start of `<head>`. Then it writes the page with `document.open()` and `document.write()`.
5. The site's own code runs in the app page. `?tv` turns on the site's TV mode: full-screen layout, no cursor, and remote keys, including Back (`10009`).

The app does not navigate to spelunkr.tv. After a navigation, the app cannot run its own code in the page. The fix must run before the site's player code.

## Build and install

A `.wgt` is a zip with `config.xml` at the root. You do not need Tizen Studio.

```sh
cd spelunkr-tv
mkdir -p ../dist
zip -X -q ../dist/Spelunkr.wgt config.xml index.html style.css boot.js tvshell.js tvfix.js icon.png
```

Increase `version` in `config.xml` for each new build.

The TV installs only signed packages. Use one of these tools to sign and install:

- **Apps2Samsung** on a PC or phone: install a custom `.wgt`. It signs the package with your certificate.
- **TV-Store** on the TV (from Apps2Samsung): it signs the package on the TV.

TV-Store steps:

1. Set Developer mode **Host PC IP** to the TV's own IP. TV-Store installs only with that value.
2. Send the package:

   ```sh
   curl -X PUT --data-binary @dist/Spelunkr.wgt "http://<TV_IP>:8077/upload?name=Spelunkr.wgt"
   ```

3. On the TV, press **Install** in TV-Store.

TV-Store keeps an install log at `http://<TV_IP>:8077/log.txt`.

## When spelunkr.tv changes

The site changes often. Run the check script after a site update, or when the app stops playing video:

```sh
node scripts/check-site.mjs
```

It tests the site behavior that the app depends on. These are the risks, from most to least likely:

1. **The video URL format.** `tvfix.js` changes only `https://archive.org/download/<item>/<file>` values in `video.src`. If the site builds video URLs in a different way, the fix does nothing. Then the video fails and the site retries again and again. The check script looks for this URL form in the bundle.
2. **Data outside spelunkr.tv.** The site picks its data server by host name. In the app, the host is not spelunkr.tv, so the site reads Supabase storage. If the site removes that path, the app gets no channel list.
3. **Cross-origin reads.** `boot.js` needs `Access-Control-Allow-Origin` on the HTML and on the bundle. Without it, the app shows "No connection to spelunkr.tv" and retries.
4. **Reloads.** `tvshell.js` stops each reload to a `file:` URL and starts the app again. A new kind of navigation can need a change there.

If the site owner fixes the seek problem on their side (see "What we found"), you can remove `tvfix.js`.

## Debugging on the TV

This method gives you the Chrome DevTools protocol for the app, with no Tizen Studio. Set these two values first:

```sh
export TV_IP=<the TV's LAN IP>
export PC_IP=<this PC's LAN IP>
```

1. On the TV, open **Apps**, type `12345`, and set **Host PC IP** to `PC_IP`. Restart the TV.
2. Start the installed app in debug mode and get the inspector port:

   ```sh
   debug/debug-launch.sh          # prints the port, for example 44261
   ```

3. Use the inspector client:

   ```sh
   node debug/cdp.mjs $TV_IP:<port> eval "location.href"
   node debug/cdp.mjs $TV_IP:<port> watch 30          # console, errors, network
   node debug/cdp.mjs $TV_IP:<port> screenshot out.png
   ```

4. Set Host PC IP back to the TV's IP before you install with TV-Store again.

Other tools in `debug/`:

| Tool | Use |
|---|---|
| `server.py` | Log server and proxy: `python3 debug/server.py` (uses `PC_IP`, port 8765). It proxies spelunkr.tv and adds `dbg.js` and `tvfix.js` to the HTML. It stores TV logs in `logs.jsonl`. It also sends the code in `cmd.js` to the page, which runs it. Use it only on a home network, and stop it after debugging. |
| `dbg.js` | Logger for the page: console, errors, video events, `play()` rejections, keys, a state snapshot every 5 s. |
| `summarize.py` | Prints the TV lines of `logs.jsonl` in a short form (uses `TV_IP`). |
| `boot-test.mjs` | Runs the `boot.js` flow in the debug page, with `dbg.js` and the app scripts written in inline. Use it to test a change before you build a package. Run `location.reload()` in the page first (see the CSP pitfall). |
| `videotest.js` | Plays one URL in an empty page, with an optional seek, and records the video events. |
| `sdbc.py` | Minimal `sdb` client in Python: `python3 debug/sdbc.py $TV_IP shell "0 debug <appId>"`. |
| `tv-remote.mjs` | Samsung remote-control WebSocket. It did not work: the TV did not answer. See the pitfalls below. |

To run the site through the proxy on the TV, start `server.py`, then open the proxy URL in the debug page:

```sh
node debug/cdp.mjs $TV_IP:<port> eval "location.href = 'http://$PC_IP:8765/?tv'"
```

The TV REST API on port 8001 works with no pairing:

```sh
curl http://$TV_IP:8001/api/v2/                                         # TV info, Developer mode, Host PC IP
curl http://$TV_IP:8001/api/v2/applications/SpelunkrTV.Spelunkr          # running, visible, version
curl -X DELETE http://$TV_IP:8001/api/v2/applications/SpelunkrTV.Spelunkr  # close the app
curl -X POST   http://$TV_IP:8001/api/v2/applications/SpelunkrTV.Spelunkr  # start the app
```

## What we found

### 1. Black screen: the default CSP of the TV

If `config.xml` has no `<tizen:content-security-policy>`, the TV applies `script-src 'self'; style-src 'self'`. This blocks inline `<script>` and `<style>`. Without the inline style, the text is black on a black background. You see only a black screen, and no request leaves the TV.

The fix is the `<tizen:content-security-policy>` element in `config.xml`. The site needs inline scripts and remote scripts, so the policy allows both.

### 2. No video: Samsung's player cannot seek through a redirect

The site syncs all viewers, so it always seeks to the live position in the file. `https://archive.org/download/<item>/<file>` answers `302` to a storage server, for example `dnXXXXXX.ca.archive.org`. Samsung's player plays such a URL from 0 s. A seek fails after about 3 s with `MediaError` code 2, `PIPELINE_ERROR_NETWORK`. The same seek on the storage-server URL works.

The site then retries every few seconds, so the screen stays black.

`tvfix.js` gets `https://archive.org/metadata/<item>` and builds `https://<server><dir>/<file>`. It uses `alternate_locations.servers[0]`, then `server`, then `d1`.

Weak Wi-Fi can also stop playback. Our TV had a weak 5 GHz signal and works on 2.4 GHz.

## Pitfalls

### Tizen app

- Do not use inline `<script>` or `<style>` in `index.html`. If you remove the CSP element from `config.xml`, they stop working, with no visible error.
- After `location.reload()`, the TV does not apply the default CSP. A debug test with a reload can work, and a fresh start can still fail. Always test a fresh start.
- The TV has no file at `file:///<path>`. A reload at `file:///?tv` or `file:///<channel>` shows the TV's error page. `tvshell.js` stops these reloads with the Navigation API and starts `file:///index.html` again.
- `<base href="https://spelunkr.tv/">` also applies to `history.pushState("/x")`. The result is a cross-origin URL, and the call throws. `tvshell.js` resolves these URLs against `location.href`.
- `location.origin` is `file://` in the app, and requests send `Origin: null`. A server must answer `*` or `null` in `Access-Control-Allow-Origin`. archive.org answers `null`.
- The site's clock check (`${location.origin}/?_clock=`) fails in the app. The site catches the error and uses the TV clock.
- `document.open()` removes the event listeners on `window`. Add listeners in scripts that the written page loads (`tvshell.js`), not in `boot.js`.
- The TV keeps CH▲▼ and the media keys unless the app registers them with `tizen.tvinputdevice`. This needs the `tv.inputdevice` privilege. Arrows, Enter and Back reach the page without registration.
- spelunkr.tv sends `X-Frame-Options: SAMEORIGIN`. An `<iframe>` of the site does not work.

### tvfix.js

- The getters for `src`, `currentSrc` and `getAttribute("src")` give back the site's original URL. The site compares `src` with the URL that it set, and sets it again when they differ. A changed getter value can start a reload loop.
- The metadata request is synchronous. The site sets `currentTime` immediately after `src`, so the final URL must be ready at that time.
- A `HEAD` to the storage-server URL has no CORS header. You cannot read the redirect target from the page. Use the metadata API.
- The site's 4:3 crop feature (`crop43`) reads `currentSrc`. It works because of the getter.

### Debugging

- The TV plays video with Samsung's own player. Video requests do not show in the Network panel. You see only the media events and `MediaError.message`.
- Screenshots do not show the video, because the TV draws video on a separate hardware layer. Read `video.currentTime` to see if it plays.
- `sdbd` closes the connection (`Connection reset by peer`) when the PC is not the Host PC IP.
- `sdbd` on a retail TV accepts only `shell:0 <command>` commands, such as `0 debug`, `0 vd_appinstall` and `0 getappinfo`. Plain shell commands are refused.
- `0 debug <appId>` gives no output while the app runs. Close the app first (`DELETE` on the REST API). `debug-launch.sh` does this.
- The inspector port is open on the TV's IP. You do not need `sdb forward`.
- If the TV web runtime restarts the app, for example after a crash, the debug port closes. The app can still show as running. Run `debug-launch.sh` again.
- A proxy must not pass `If-None-Match` to the site. A `304` makes the TV use a cached page without the added scripts. `server.py` drops this header and sends `Cache-Control: no-store`.
- The Samsung remote-control WebSocket (ports 8001 and 8002) opened, but the TV sent no message. It probably waits for an **Allow** prompt on the TV. We did not use it.
- The proxy page is plain HTTP. It is not a secure context, so `crypto.randomUUID` and `navigator.locks` are missing. The site checks for both, so it works.

## Open items

- Sound is not tested. The site starts the video muted, and a key press should turn the sound on.
- CH▲▼ is not tested on the TV. If the site does not react, check the `key` and `keyCode` values of those keys with `dbg.js`.
- Long viewing is not tested.

## License

MIT. See `LICENSE`.
