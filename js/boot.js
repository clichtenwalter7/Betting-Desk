/* Start-up, data refresh loop and service worker. */
function loadSlate() {
  var get = function (u) { return fetch(u + "?t=" + Date.now(), { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }); };
  return Promise.all([get("data/nba.json").catch(function () { return null; }), get("data/slate.json").catch(function () { return null; })]).then(function (r) {
    if (r[0]) NBAD = r[0];
    if (r[1]) { SLATE = r[1]; store.set("slate", SLATE); }
    buildPicks(); N.slate();
  });
}
function neededSports() {
  var s = {}, add = function (x) { if (x && X.sport(x)) s[x] = 1; };
  if (SLATE) {
    (SLATE.picks || []).forEach(function (r) { add(r.sp); });
    (SLATE.totals || []).forEach(function (r) { add(r.sp); });
    (SLATE.props || []).forEach(function (r) { add(r.sp); });
    if (SLATE.nba && SLATE.nba.games && SLATE.nba.games.length) add("NBA");
  }
  BETS.forEach(function (b) { if (b.r === "open") (b.lg || []).forEach(function (l) { add(l.sp || b.sp); }); });
  if (UI.tab === "scores") add(UI.sp);
  Object.keys(STAR).forEach(function (id) { if (X.index[id]) add(X.index[id].sp); });
  if (UI.tab === "today" || UI.tab === "picks") SPORT_ORDER.forEach(function (k) { if (s[k]) return; });
  return Object.keys(s);
}
function daysFor(sp) {
  var d = {}; d[today()] = 1;
  if (SLATE) {
    (SLATE.picks || []).concat(SLATE.totals || [], SLATE.props || []).forEach(function (r) { if (r.sp === sp && r.d) d[r.d] = 1; });
    if (sp === "NBA" && SLATE.nba) (SLATE.nba.games || []).forEach(function (g) { if (g.d) d[g.d] = 1; });
  }
  if (UI.tab === "scores" && UI.sp === sp) d[UI.day] = 1;
  return Object.keys(d);
}
function stateSig() {
  var parts = [];
  gamesList().forEach(function (g) { parts.push(g.id + g.state + g.a.score + g.h.score + g.detail + (g.odds ? g.odds.mlA + "/" + g.odds.mlH + "/" + g.odds.total + "/" + g.odds.spreadH : "")); });
  parts.push(BETS.length + ":" + BETS.map(function (b) { return b.r; }).join(""));
  parts.push(PICKS.map(function (p) { return p.id + p.u + p.od + p.state; }).join(""));
  return parts.join("|");
}
/* Closing line value: while a single moneyline bet's game has not started, keep the latest DraftKings price; it freezes at the start. */
function trackClose() {
  var ch = false;
  BETS.forEach(function (b) {
    if (b.r !== "open" || !b.lg || b.lg.length !== 1) return;
    var l = b.lg[0]; if (l.t !== "ml" || !l.eid || !l.side) return;
    var g = X.index[String(l.eid)]; if (!g || !g.odds || g.state !== "pre") return;
    var c = l.side === "a" ? g.odds.mlA : g.odds.mlH;
    if (E.okOdds(c) && b.cl !== c) { b.cl = c; ch = true; }
  });
  if (ch) saveBets();
}
var refreshing = false;
function refreshLive(force) {
  if (refreshing) return Promise.resolve();
  refreshing = true;
  var jobs = [];
  neededSports().forEach(function (sp) { daysFor(sp).forEach(function (d) { jobs.push(X.loadDay(sp, d, force ? { force: true } : undefined).catch(function () { })); }); });
  return Promise.all(jobs).then(function () {
    buildPicks();
    return autoSettle();
  }).then(function () {
    trackClose(); N.scan();
    var sig = stateSig();
    if (sig !== UI.sig) { UI.sig = sig; if (UI.tab !== "tools") rerender(); if (UI.sheet && UI.sheet.type === "game") paintGame(); }
    else { var st = X.status, chip = $("feedchip"); chip.className = "chip" + (st.ok === false ? " ls" : st.ok ? "" : " nt"); chip.textContent = st.ok === false ? "Offline" : st.ok ? "Live" : "Connecting"; }
    UI.updated = Date.now();
    var u = $("scupd"); if (u) u.textContent = "Updated " + new Date(UI.updated).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  }).catch(function () { }).then(function () { refreshing = false; });
}
var lastSlate = Date.now();
function tick() {
  if (document.hidden) return;
  refreshLive();
  if (Date.now() - lastSlate > 600000) { lastSlate = Date.now(); loadSlate().then(function () { return refreshLive(true); }); }
}
function init() {
  applyTheme(); X.loadFin(); renderAll();
  loadSlate().then(function () { renderAll(); return refreshLive(true); });
  setInterval(tick, 30000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { if (Date.now() - lastSlate > 300000) { lastSlate = Date.now(); loadSlate().then(function () { refreshLive(true); }); } else refreshLive(true); } });
  window.addEventListener("online", function () { refreshLive(true); });
  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) navigator.serviceWorker.register("sw.js").catch(function () { });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
