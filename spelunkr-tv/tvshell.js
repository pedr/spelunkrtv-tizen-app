// Lets spelunkr.tv run inside the app's file:///index.html page (see boot.js).
(function () {
  // <base href="https://spelunkr.tv/"> would resolve the site's pushState("/<channel>") to
  // another origin, which throws.
  ["pushState", "replaceState"].forEach(function (name) {
    var original = history[name];
    history[name] = function (state, title, url) {
      if (typeof url === "string") url = new URL(url, location.href).href;
      return original.call(history, state, title, url);
    };
  });

  // The site reloads the page in some cases (CRT switch, error recovery). The TV has no file
  // at file:///<path> and shows its error page, so start the app again instead.
  if (window.navigation) {
    navigation.addEventListener("navigate", function (e) {
      if (e.destination.sameDocument || !e.cancelable) return;
      if (new URL(e.destination.url).protocol !== "file:") return;
      e.preventDefault();
      setTimeout(function () { location.replace("file:///index.html"); }, 0);
    });
  }

  // Without registration the TV keeps these keys for itself (needs the tv.inputdevice privilege).
  try {
    var keys = ["ChannelUp", "ChannelDown", "MediaPlayPause", "MediaPlay", "MediaPause",
      "MediaFastForward", "MediaRewind", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
    var supported = tizen.tvinputdevice.getSupportedKeys().map(function (k) { return k.name; });
    keys.filter(function (k) { return supported.indexOf(k) !== -1; }).forEach(function (k) {
      tizen.tvinputdevice.registerKey(k);
    });
  } catch (e) { /* not on a TV */ }
})();
