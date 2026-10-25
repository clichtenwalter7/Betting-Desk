/* Service worker: the app opens instantly and works offline; daily picks always try the network first. */
var CACHE = "bd-v3";
var SHELL = ["./", "index.html", "css/app.css", "js/engine.js", "js/espn.js", "js/state.js", "js/notify.js", "js/picks.js", "js/views.js", "js/actions.js", "js/boot.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener("install", function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  if (u.pathname.indexOf("/data/") >= 0) {
    e.respondWith(fetch(r).then(function (res) { var c = res.clone(); caches.open(CACHE).then(function (ca) { ca.put(r, c); }); return res; }).catch(function () { return caches.match(r); }));
    return;
  }
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(function (hit) {
    var net = fetch(r).then(function (res) { if (res && res.ok) { var c = res.clone(); caches.open(CACHE).then(function (ca) { ca.put(r, c); }); } return res; }).catch(function () { return hit; });
    return hit || net;
  }));
});
