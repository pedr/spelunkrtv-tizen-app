// Runs spelunkr.tv inside this page instead of navigating to it: after a navigation the app
// can no longer run its own code, and tvfix.js must load before the site's player.
(function () {
  var SITE = "https://spelunkr.tv/";
  var msg = document.getElementById("msg");

  function load() {
    var x = new XMLHttpRequest();
    x.open("GET", SITE + "?tv", true);
    x.timeout = 15000;
    x.onload = function () {
      if (x.status === 200) start(x.responseText);
      else retry("spelunkr.tv answered " + x.status);
    };
    x.onerror = function () { retry("No connection to spelunkr.tv"); };
    x.ontimeout = function () { retry("spelunkr.tv did not answer"); };
    x.send();
  }

  function retry(reason) {
    msg.textContent = reason + ". Retrying…";
    setTimeout(load, 5000);
  }

  function start(html) {
    // The site routes on location.pathname, and this page is /index.html.
    history.replaceState(null, "", "/?tv");
    var head = '<base href="' + SITE + '">' +
      '<script src="file:///tvshell.js"></script>' +
      '<script src="file:///tvfix.js"></script>';
    html = html.replace(/<head[^>]*>/i, function (tag) { return tag + head; });
    document.open();
    document.write(html);
    document.close();
  }

  load();
})();
