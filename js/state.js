/* State, storage and small helpers shared by the other scripts. */
var $ = function (i) { return document.getElementById(i); };
var esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
var money = E.money, pct = E.pct, sgn = E.sgn;
var cls = function (x) { return x > .0005 ? "pos" : x < -.0005 ? "neg" : ""; };
var store = {
  get: function (k, def) { try { var v = localStorage.getItem("bd2:" + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
  set: function (k, v) { try { localStorage.setItem("bd2:" + k, JSON.stringify(v)); } catch (e) { } }
};
var today = function () { try { return new Date().toLocaleDateString("en-CA"); } catch (e) { return ""; } };
var timeOf = function (iso) { var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); };
var dayLabel = function (day) {
  var t = today();
  if (day === t) return "Today"; if (day === X.addDay(t, -1)) return "Yesterday"; if (day === X.addDay(t, 1)) return "Tomorrow";
  var d = new Date(day + "T12:00:00"); return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
};

/* settings (merged over defaults, one level deep for mw) */
var S = (function () {
  var s = JSON.parse(JSON.stringify(E.DEF)), saved = store.get("settings", {});
  for (var k in saved) { if (k === "mw") { for (var m in saved.mw) s.mw[m] = saved.mw[m]; } else if (k in s) s[k] = saved[k]; }
  if (saved.theme) s.theme = saved.theme;
  return s;
})();
var saveS = function () { store.set("settings", S); applyTheme(); };
function applyTheme() {
  var r = document.documentElement;
  if (S.theme === "light" || S.theme === "dark") r.setAttribute("data-theme", S.theme); else r.removeAttribute("data-theme");
}

var BETS = store.get("bets", []);
var PLOG = store.get("plog", {});       /* model pick log: id -> graded record */
var STAR = store.get("star", {});       /* followed game ids */
var SLATE = store.get("slate", null);   /* last daily slate */
var NBAD = { wins: {}, last: {} };
var PICKS = [];
var UI = { open: {}, tab: "today", sp: "NHL", day: today(), pickDay: null, pfilter: "ALL", sel: {}, tfilter: "all", tsp: "ALL", statsOpen: false, sheet: null };
var nextId = function () { return "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
var saveBets = function () { store.set("bets", BETS); };
var savePlog = function () { store.set("plog", PLOG); };
var saveStar = function () { store.set("star", STAR); };

function bankroll() { return S.start + BETS.reduce(function (t, b) { return t + E.profit(b); }, 0); }
var uf = function (u) { return (Math.round(u * 100) / 100) + "u"; };
var uStr = function (usd) { var u = usd / S.unit; return (u > 0 ? "+" : "") + (Math.round(u * 100) / 100) + "u"; };

function toast(m) {
  var t = $("toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.h);
  toast.h = setTimeout(function () { t.hidden = true; }, 4500);
}
/* cool-off lock */
function coolLeft() { var c = store.get("cool", 0); return c > Date.now() ? c - Date.now() : 0; }
function coolText() { var ms = coolLeft(), h = Math.floor(ms / 3600000), m = Math.ceil((ms % 3600000) / 60000); return h ? h + " h " + m + " min" : m + " min"; }
