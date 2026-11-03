// Run in an empty page on the TV via cdp.mjs eval. Plays one URL, optionally seeks, and records events in window.__ev.
(function (url, seekTo) {
  document.body.innerHTML = "";
  document.body.style.background = "#000";
  window.__ev = [];
  var t0 = Date.now();
  var v = document.createElement("video");
  v.muted = true;
  v.autoplay = true;
  v.playsInline = true;
  v.style.cssText = "width:100%;height:100%";
  ["loadstart", "loadedmetadata", "loadeddata", "canplay", "playing", "waiting", "stalled", "error", "seeking", "seeked", "timeupdate"].forEach(function (ev) {
    v.addEventListener(ev, function () {
      if (ev === "timeupdate" && window.__ev.filter(function (e) { return e[1] === "timeupdate"; }).length > 3) return;
      window.__ev.push([((Date.now() - t0) / 1000).toFixed(1), ev, v.readyState, v.networkState, Math.round(v.currentTime), v.error && v.error.message]);
    });
  });
  if (seekTo) v.addEventListener("loadedmetadata", function () { v.currentTime = seekTo; }, { once: true });
  document.body.appendChild(v);
  v.src = url;
  window.__v = v;
  return "started " + url + " seek=" + seekTo;
})
