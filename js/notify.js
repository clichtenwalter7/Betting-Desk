/* Notifications: fire while the app is open or recently in the background. True background push needs a server, so this is honest "best effort". */
var N = {
  ok: function () { return "Notification" in window; },
  perm: function () { return N.ok() ? Notification.permission : "unsupported"; },
  on: function () { return N.ok() && Notification.permission === "granted" && store.get("notify", true) !== false; },
  send: function (title, body, tag) {
    if (!N.on()) return;
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then(function (reg) { reg.showNotification(title, { body: body, tag: tag, icon: "icons/icon-192.png", badge: "icons/icon-192.png" }); }).catch(function () { try { new Notification(title, { body: body, tag: tag }); } catch (e) { } });
      } else new Notification(title, { body: body, tag: tag });
    } catch (e) { }
  },
  ask: function () {
    if (!N.ok()) { toast("This browser does not support notifications. On iPhone, add the app to your Home Screen first."); return Promise.resolve(); }
    return Notification.requestPermission().then(function (p) {
      store.set("notify", p === "granted");
      if (p === "granted") { N.send("Notifications on", "You will get bet results, game starts for your bets and new picks.", "hello"); toast("Notifications on."); }
      else toast("Notifications are blocked. Turn them on in your phone's settings for this app.");
    });
  },
  /* Called after every refresh: compares game states with what we last saw and notifies on changes that matter to the user. */
  scan: function () {
    var seen = store.get("nstate", null), first = seen === null, cur = {}, watch = {};
    BETS.forEach(function (b) { if (b.r === "open") (b.lg || []).forEach(function (l) { if (l.eid) watch[String(l.eid)] = b.l; }); });
    Object.keys(STAR).forEach(function (id) { if (STAR[id]) watch[String(id)] = watch[String(id)] || null; });
    Object.keys(watch).forEach(function (id) {
      var g = X.index[id]; if (!g) return;
      cur[id] = g.state;
      var was = seen && seen[id], name = g.a.nick + " at " + g.h.nick;
      if (first || was === undefined || was === g.state) return;
      if (g.state === "in") N.send("Game started", name + (watch[id] ? " (your bet: " + watch[id] + ")" : ""), "s" + id);
      else if (g.state === "post") N.send("Final: " + name, g.a.nick + " " + g.a.score + ", " + g.h.nick + " " + g.h.score + (watch[id] ? " | your bet: " + watch[id] : ""), "f" + id);
    });
    store.set("nstate", Object.assign({}, seen || {}, cur));
  },
  slate: function () {
    if (!SLATE || !SLATE.asof) return;
    var last = store.get("nslate", null); store.set("nslate", SLATE.asof);
    if (last && last !== SLATE.asof) {
      var n = (PICKS || []).filter(function (p) { return p.d === today() && p.u > 0 && p.state === "pre"; }).length;
      N.send("New picks posted", n ? n + " recommended " + (n === 1 ? "bet" : "bets") + " for today." : "Today's picks are updated.", "slate");
    }
  }
};
