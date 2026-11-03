// Samsung's TV media player fails (MEDIA_ERR_NETWORK) when it seeks inside a file behind
// archive.org's 302 redirect, and spelunkr always seeks to the live offset. Point every
// archive.org/download URL straight at the storage server from the item's metadata.
(function () {
  if (window.__spelunkrTvFix) return;
  window.__spelunkrTvFix = true;

  var DOWNLOAD = /^https?:\/\/archive\.org\/download\/([^/?#]+)\/([^?#]+)(.*)$/;
  var locations = {};

  function itemLocation(id) {
    if (id in locations) return locations[id];
    locations[id] = null;
    try {
      // Synchronous on purpose: the site sets currentTime right after src, so the URL must be final now.
      var x = new XMLHttpRequest();
      x.open("GET", "https://archive.org/metadata/" + encodeURIComponent(id), false);
      x.send();
      if (x.status === 200) {
        var m = JSON.parse(x.responseText);
        var alt = m.alternate_locations && m.alternate_locations.servers && m.alternate_locations.servers[0];
        var server = (alt && alt.server) || m.server || m.d1;
        var dir = (alt && alt.dir) || m.dir;
        if (server && dir) locations[id] = "https://" + server + dir + "/";
      }
    } catch (e) { /* keep the original URL */ }
    return locations[id];
  }

  function direct(url) {
    var m = typeof url === "string" && url.match(DOWNLOAD);
    if (!m) return url;
    var base = itemLocation(decodeURIComponent(m[1]));
    return base ? base + m[2] + m[3] : url;
  }

  // The site compares src/currentSrc with the URL it set (and sets it again when they differ),
  // so the getters give back the original URL.
  var original = new WeakMap();
  function setSrc(el, value, write) {
    var url = direct(value);
    if (url !== value) original.set(el, { from: value, to: new URL(url).href });
    else original.delete(el);
    write(url);
  }
  function readSrc(el, real) {
    var o = original.get(el);
    return o && real === o.to ? o.from : real;
  }

  var src = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
  Object.defineProperty(HTMLMediaElement.prototype, "src", {
    configurable: true,
    enumerable: src.enumerable,
    get: function () { return readSrc(this, src.get.call(this)); },
    set: function (v) {
      var el = this;
      if (el.tagName !== "VIDEO") return src.set.call(el, v);
      setSrc(el, String(v), function (u) { src.set.call(el, u); });
    },
  });

  var currentSrc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "currentSrc");
  Object.defineProperty(HTMLMediaElement.prototype, "currentSrc", {
    configurable: true,
    enumerable: currentSrc.enumerable,
    get: function () { return readSrc(this, currentSrc.get.call(this)); },
  });

  var setAttribute = Element.prototype.setAttribute;
  var getAttribute = Element.prototype.getAttribute;
  Element.prototype.setAttribute = function (name, value) {
    var el = this;
    if (el.tagName !== "VIDEO" || String(name).toLowerCase() !== "src") return setAttribute.call(el, name, value);
    setSrc(el, String(value), function (u) { setAttribute.call(el, name, u); });
  };
  Element.prototype.getAttribute = function (name) {
    var v = getAttribute.call(this, name);
    return this.tagName === "VIDEO" && String(name).toLowerCase() === "src" ? readSrc(this, v) : v;
  };
})();
