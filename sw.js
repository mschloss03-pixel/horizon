/* Horizon service worker. All paths relative (site lives under a sub-path). */
var VERSION = 'v8';
var SHELL = 'hz-shell-' + VERSION;
var LIBS = 'hz-libs-' + VERSION;
var FONTS = 'hz-fonts-' + VERSION;
var KEEP = [SHELL, LIBS, FONTS];
var PRECACHE = ['./', './index.html', './data.js', './manifest.webmanifest', './logo.png', './favicon.png',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) {
    // add individually so one missing file doesn't abort install
    return Promise.all(PRECACHE.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return KEEP.indexOf(k) < 0; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function networkFirst(req) {
  return fetch(req).then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(SHELL).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined) || Response.error();
    });
  });
}
function cacheFirst(req, name) {
  return caches.open(name).then(function (c) {
    return c.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
        return res;
      });
    });
  });
}
function staleWhileRevalidate(req, name) {
  return caches.open(name).then(function (c) {
    return c.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // session-dependent members pages: always the network, never cached
  if (url.origin === self.location.origin && /\/club(-config)?\.(html|js)$/.test(url.pathname)) return;
  if (url.origin === self.location.origin) { e.respondWith(networkFirst(req)); return; }
  if ((url.hostname === 'unpkg.com' && /lightweight-charts@[\d.]+\//.test(url.pathname)) ||
      (url.hostname === 'cdnjs.cloudflare.com' && /\/lightweight-charts\/[\d.]+\//.test(url.pathname))) {
    e.respondWith(cacheFirst(req, LIBS)); return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(staleWhileRevalidate(req, FONTS)); return;
  }
  // everything else (Coinbase / Kraken price APIs): untouched, straight to network
});
