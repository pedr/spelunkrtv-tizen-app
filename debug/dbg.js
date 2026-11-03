// Debug logger that server.py adds to every proxied spelunkr.tv page. Sends events to /__log.
(function () {
  if (window.__spelunkrDbg) return;
  window.__spelunkrDbg = true;
  var queue = [];
  var t0 = Date.now();

  function short(v) {
    try {
      if (v instanceof Error) return v.name + ": " + v.message + (v.stack ? " | " + v.stack.split("\n").slice(0, 3).join(" | ") : "");
      if (typeof v === "object") return JSON.stringify(v).slice(0, 600);
      return String(v).slice(0, 600);
    } catch (e) { return String(v); }
  }
  function log(kind) {
    var parts = [];
    for (var i = 1; i < arguments.length; i++) parts.push(short(arguments[i]));
    queue.push(JSON.stringify({ t: ((Date.now() - t0) / 1000).toFixed(1), k: kind, m: parts.join(" ") }));
  }
  function flush() {
    if (!queue.length) return;
    var body = queue.join("\n");
    queue = [];
    try {
      var x = new XMLHttpRequest();
      x.open("POST", (window.__DBG_SERVER || "") + "/__log", true);
      x.send(body);
    } catch (e) { /* server down */ }
  }
  setInterval(flush, 1000);
  window.__dbgLog = log;

  ["log", "info", "warn", "error", "debug"].forEach(function (name) {
    var orig = console[name];
    console[name] = function () {
      var a = ["console." + name];
      for (var i = 0; i < arguments.length; i++) a.push(arguments[i]);
      log.apply(null, a);
      return orig.apply(console, arguments);
    };
  });
  window.addEventListener("error", function (e) {
    log("error", e.message, (e.filename || "") + ":" + e.lineno + ":" + e.colno, e.error || "",
      e.target && e.target !== window ? "target=" + (e.target.tagName || "") + " " + (e.target.src || e.target.href || "") : "");
  }, true);
  window.addEventListener("unhandledrejection", function (e) { log("rejection", e.reason); });

  function mediaState(m) {
    return {
      tag: m.tagName, src: (m.currentSrc || m.src || "").slice(-90), rs: m.readyState, ns: m.networkState,
      err: m.error && m.error.code, errMsg: m.error && m.error.message, paused: m.paused, muted: m.muted,
      t: Math.round(m.currentTime * 10) / 10, buf: m.buffered.length ? Math.round(m.buffered.end(m.buffered.length - 1)) : 0,
    };
  }
  ["loadstart", "loadedmetadata", "loadeddata", "canplay", "playing", "waiting", "stalled", "error", "abort",
    "emptied", "suspend", "pause", "ended"].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      if (e.target && e.target.tagName === "VIDEO") log("media." + ev, mediaState(e.target));
    }, true);
  });
  var origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    var el = this;
    var p = origPlay.apply(el, arguments);
    if (p && p.catch) p.catch(function (e) { log("play.rejected", el.tagName, e && e.name, e && e.message, (el.currentSrc || el.src || "").slice(-60)); });
    return p;
  };
  document.addEventListener("keydown", function (e) { log("key", e.key, e.keyCode); }, true);

  function snapshot() {
    var v = document.querySelector("video");
    log("snap", {
      href: location.href, cls: document.documentElement.className, vis: document.visibilityState,
      videos: document.querySelectorAll("video").length, audios: document.querySelectorAll("audio").length,
      video: v ? mediaState(v) : null,
      text: (document.body && document.body.innerText || "").replace(/\s+/g, " ").slice(0, 160),
    });
  }
  setInterval(snapshot, 5000);

  log("boot", { ua: navigator.userAgent, href: location.href, secure: window.isSecureContext,
    w: innerWidth, h: innerHeight, dpr: devicePixelRatio, online: navigator.onLine });

  // Live console: run new code from /__cmd and log the result.
  var lastCmd = null;
  setInterval(function () {
    var x = new XMLHttpRequest();
    x.open("GET", (window.__DBG_SERVER || "") + "/__cmd?" + Date.now(), true);
    x.onload = function () {
      var code = x.responseText;
      if (!code || code === lastCmd) return;
      lastCmd = code;
      try {
        var r = (0, eval)(code);
        if (r && typeof r.then === "function") r.then(function (v) { log("cmd.result", v); }, function (e) { log("cmd.error", e); });
        else log("cmd.result", r);
      } catch (e) { log("cmd.error", e); }
    };
    x.send();
  }, 2000);
})();
