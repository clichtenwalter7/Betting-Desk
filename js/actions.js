/* Taps, sheets and bet actions. */
var ACT = {};
function openSheet(html) { $("shp").innerHTML = html; $("sheet").hidden = false; }
function closeSheet() {
  $("sheet").hidden = true; $("shp").innerHTML = ""; UI.sheet = null;
  if (UI.poll) { clearInterval(UI.poll); UI.poll = null; }
}
var hdr = function (title) { return '<div class="row"><h2 style="margin:0">' + esc(title) + '</h2><button class="x" data-act="close">Close</button></div>'; };
var fld = function (label, id, val, o) {
  o = o || {};
  return '<label class="f" ' + (o.style ? 'style="' + o.style + '"' : "") + ">" + label + '<input id="' + id + '" type="' + (o.type || "number") + '" ' + (o.step === undefined ? 'step="any"' : (o.step ? 'step="' + o.step + '"' : "")) + ' value="' + esc(val == null ? "" : val) + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : "") + (o.type === "text" ? "" : ' inputmode="decimal"') + "></label>";
};
function rerender() { renderAll(); }

document.addEventListener("click", function (e) {
  var t = e.target.closest("[data-act]");
  if (!t) { if (e.target === $("sheet")) closeSheet(); return; }
  var a = t.dataset.act;
  if (a === "sel") return;
  if (ACT[a]) { if (t.tagName === "A") e.preventDefault(); ACT[a](t, t.dataset.v, t.dataset.id, e); }
});
document.addEventListener("change", function (e) {
  var t = e.target;
  if (t.dataset && t.dataset.act === "sel") { UI.sel[t.dataset.id] = t.checked; renderSelBar(); return; }
  if (t.dataset && t.dataset.setting) { setSetting(t); return; }
  if (t.dataset && t.dataset.leg != null) { legChange(t); return; }
});
document.addEventListener("input", function (e) { if (e.target.dataset && e.target.dataset.calc) calcAll(); });
document.addEventListener("toggle", function (e) { var k = e.target.dataset && e.target.dataset.k; if (k) UI.open[k] = e.target.open; }, true);

ACT.close = function () { closeSheet(); };
ACT.tab = function (t, v) { UI.tab = v; window.scrollTo(0, 0); rerender(); if (v === "scores") loadScores(); };
ACT.sp = function (t, v) { UI.sp = v; loadScores(); };
ACT.dayshift = function (t, v) { UI.day = X.addDay(UI.day, +v); loadScores(); };
ACT.pday = function (t, v) { UI.pickDay = v; rerender(); };
ACT.pfilter = function (t, v) { UI.pfilter = v; rerender(); };
ACT.tfilter = function (t, v) { UI.tfilter = v; rerender(); };
ACT.tsp = function (t, v) { UI.tsp = v; rerender(); };
ACT.star = function (t, v, id, e) {
  e.stopPropagation();
  if (STAR[id]) delete STAR[id]; else STAR[id] = Date.now();
  saveStar(); rerender();
  if (UI.sheet && UI.sheet.type === "game") paintGame();
};
function loadScores() {
  UI.loading = true; rerender();
  X.loadDay(UI.sp, UI.day, { force: true }).catch(function () { }).then(function () {
    UI.loading = false; UI.updated = Date.now(); buildPicks(); autoSettle(); rerender();
  });
}

/* ---------- logging a pick ---------- */
function pickById(id) { return PICKS.filter(function (p) { return p.id === id; })[0]; }
function blocked() {
  if (coolLeft()) return "Cool-off is on for " + coolText() + ". Logging is switched off.";
  var g = E.guard(BETS, today(), S);
  return g.hit ? g.msg + " Logging is switched off for today." : "";
}
ACT.log = function (t, v, id) {
  var p = pickById(id); if (!p) return;
  UI.sheet = { type: "log", id: id };
  var b = blocked();
  openSheet(hdr("Log " + p.label) +
    '<div class="mu">' + esc(p.game) + (p.when ? " · " + esc(p.when) : "") + "</div>" + (b ? '<div class="alert">' + esc(b) + "</div>" : "") +
    (p.g ? "" : '<div class="note">I could not match this to a live game, so it will not settle by itself. You can mark the result later.</div>') +
    '<div class="g2" style="margin:12px 0">' + fld("Odds (what your sportsbook shows)", "lo", p.od) + fld("Stake ($, 1 unit = " + money(S.unit) + ")", "ls", (p.stake || S.unit)) + "</div>" +
    '<div class="mu">Suggested: ' + (p.u > 0 ? uf(p.u) + " = " + money(p.stake) : "no edge at this price, so I would pass") + ". Win chance " + pct(p.pu, 0) + " against break-even " + pct(p.be, 0) + ". Check the price in your sportsbook first.</div>" +
    '<div id="lm"></div><button class="btn block" style="margin-top:12px" data-act="confirmlog" ' + (b ? "disabled" : "") + ">Log this bet</button>");
};
ACT.confirmlog = function () {
  var p = pickById(UI.sheet && UI.sheet.id); if (!p) return;
  var o = +$("lo").value, s = +$("ls").value;
  if (!E.okOdds(o) || !(s > 0)) { $("lm").innerHTML = '<div class="alert">Enter valid odds (like -110 or +150) and a stake above zero.</div>'; return; }
  if (blocked()) return;
  var ty = p.type === "prop" ? "Player prop" : p.type === "total" ? "Game total" : p.leg.t === "spread" ? "Spread" : "Moneyline";
  BETS.push({ id: nextId(), ts: Date.now(), d: today(), l: p.label, o: o, s: s, tp: null, r: "open", p: p.pu, sp: p.sp, ty: ty, pid: p.id, lg: [Object.assign({}, p.leg)], n: "" });
  saveBets(); closeSheet(); toast("Logged. It now shows under Your open bets."); UI.tab = "today"; rerender();
};
ACT.share = function (t, v, id) {
  var p = pickById(id); if (!p) return;
  var txt = p.label + " (" + sgn(p.od) + ") - " + pct(p.pu, 0) + " win chance, " + (p.u > 0 ? uf(p.u) : "no edge") + ". " + p.game + ". Not a guarantee. Bet responsibly.";
  if (navigator.share) navigator.share({ title: "Betting Desk pick", text: txt }).catch(function () { });
  else if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { toast("Pick copied. Paste it anywhere."); }, function () { toast(txt); });
  else toast(txt);
};

/* ---------- parlay builder ---------- */
ACT.parlay = function () {
  var ps = PICKS.filter(function (p) { return UI.sel[p.id] && p.state === "pre" && p.leg; });
  if (ps.length < 2) { toast("Pick at least two bets first."); return; }
  UI.sheet = { type: "parlay", ids: ps.map(function (p) { return p.id; }) };
  var games = {}, same = false;
  ps.forEach(function (p) { var k = p.leg.eid || p.game; if (games[k]) same = true; games[k] = 1; });
  var pl = E.parlay(ps.map(function (p) { return p.od; })), pw = ps.reduce(function (a, p) { return a * p.pu; }, 1), ev = pw * pl.dec - 1, b = blocked();
  openSheet(hdr("Parlay (" + ps.length + " legs)") +
    ps.map(function (p) { return '<div class="leg"><span>' + esc(p.label) + '<div class="mu">' + esc(p.game) + "</div></span><span>" + sgn(p.od) + "</span></div>"; }).join("") +
    (same ? '<div class="note">Two legs are from the same game. Those are not independent, and many books price same-game parlays differently or block them.</div>' : "") +
    (b ? '<div class="alert">' + esc(b) + "</div>" : "") +
    '<div class="st2"><div>Combined odds<b>' + sgn(pl.am) + "</b></div><div>Win chance<b>" + pct(pw, 1) + "</b></div><div>EV per $1<b class=\"" + cls(ev) + '">' + (ev >= 0 ? "+" : "") + (ev * 100).toFixed(1) + "%</b></div></div>" +
    '<div class="mu">Parlays multiply the sportsbook\'s edge, so they lose more often than the single bets would. Keep the stake small. Edit the odds to match your sportsbook\'s parlay price.</div>' +
    '<div class="g2" style="margin:12px 0">' + fld("Odds", "po", pl.am) + fld("Stake ($)", "ps", S.unit * .5) + '</div><div id="lm"></div><button class="btn block" data-act="confirmparlay" ' + (b ? "disabled" : "") + ">Log parlay</button>");
};
ACT.confirmparlay = function () {
  var ps = PICKS.filter(function (p) { return UI.sheet && UI.sheet.ids.indexOf(p.id) >= 0; }), o = +$("po").value, s = +$("ps").value;
  if (!E.okOdds(o) || !(s > 0)) { $("lm").innerHTML = '<div class="alert">Enter valid odds and a stake above zero.</div>'; return; }
  if (blocked()) return;
  var sps = {}; ps.forEach(function (p) { sps[p.sp] = 1; });
  BETS.push({ id: nextId(), ts: Date.now(), d: today(), l: "Parlay: " + ps.map(function (p) { return p.label; }).join(" + "), o: o, s: s, tp: null, r: "open", p: ps.reduce(function (a, p) { return a * p.pu; }, 1), sp: Object.keys(sps).length === 1 ? Object.keys(sps)[0] : "Multi", ty: "Parlay", pid: ps.map(function (p) { return p.id; }).join("|"), lg: ps.map(function (p) { return Object.assign({}, p.leg); }), n: "" });
  UI.sel = {}; saveBets(); closeSheet(); toast("Parlay logged."); UI.tab = "today"; rerender();
};

/* ---------- game details ---------- */
ACT.game = function (t, v, id) { openGame(id); };
function openGame(id) {
  var g = X.index[id]; if (!g) return;
  UI.sheet = { type: "game", id: id, detail: null, err: "" };
  paintGame();
  fetchDetail(g);
  if (UI.poll) clearInterval(UI.poll);
  UI.poll = setInterval(function () {
    if (!UI.sheet || UI.sheet.type !== "game") return;
    var gg = X.index[UI.sheet.id]; if (!gg) return;
    X.loadDay(gg.sp, gg.day, { force: true }).catch(function () { }).then(function () { buildPicks(); fetchDetail(X.index[UI.sheet.id]); });
  }, 20000);
}
function fetchDetail(g) {
  if (!g) return;
  X.loadDetail(g.sp, g.id).then(function (d) { if (UI.sheet && UI.sheet.id === g.id) { UI.sheet.detail = d; UI.sheet.err = ""; paintGame(); } },
    function (e) { if (UI.sheet && UI.sheet.id === g.id) { UI.sheet.err = String(e && e.message || e); paintGame(); } });
}
function lineTable(g, d) {
  var la = (d && d.lines && d.lines.away && d.lines.away.length) ? d.lines.away : g.a.lines, lh = (d && d.lines && d.lines.home && d.lines.home.length) ? d.lines.home : g.h.lines;
  if (!la || !la.length) return "";
  var n = Math.max(la.length, (lh || []).length), head = "";
  for (var i = 0; i < n; i++) head += "<th>" + (i + 1) + "</th>";
  var row = function (t, arr) { var c = ""; for (var i = 0; i < n; i++) c += "<td>" + esc(arr && arr[i] != null ? arr[i] : "") + "</td>"; return "<tr><td>" + esc(t.abbr || t.short) + "</td>" + c + "<td><b>" + t.score + "</b></td></tr>"; };
  return '<div class="scroll-x"><table class="tbl"><tr><th></th>' + head + "<th>T</th></tr>" + row(g.a, la) + row(g.h, lh) + "</table></div>";
}
function paintGame() {
  var s = UI.sheet; if (!s || s.type !== "game") return;
  var g = X.index[s.id], d = s.detail; if (!g) return;
  var keep = $("shp").scrollTop, o = g.odds, h = "";
  var tmRow = function (t, win) { return '<div class="tm ' + (win ? "w" : "") + '"><span class="nm">' + logoImg(t) + (t.rank ? '<span class="rk">' + t.rank + "</span>" : "") + "<span>" + esc(t.name) + (t.rec ? ' <span class="mu">(' + esc(t.rec) + ")</span>" : "") + "</span></span><b style=\"font-size:30px\">" + (g.state === "pre" ? "" : t.score) + "</b></div>"; };
  var done = g.state === "post";
  h += '<div class="row"><div class="mu">' + esc(g.sp) + (g.venue ? " · " + esc(g.venue) : "") + '</div><span><button class="star ' + (STAR[g.id] ? "on" : "") + '" data-act="star" data-id="' + esc(g.id) + '">' + (STAR[g.id] ? "★" : "☆") + '</button><button class="x" data-act="close">Close</button></span></div>';
  h += '<div class="card flat stack">' + tmRow(g.a, done && g.a.score > g.h.score) + tmRow(g.h, done && g.h.score > g.a.score) +
    '<div class="row"><span>' + (g.state === "in" ? '<span class="badge"><i></i>Live</span> ' : "") + "<b>" + esc(g.state === "pre" ? dayLabel(g.day) + " " + timeOf(g.start) : g.long || g.detail) + '</b></span><span class="mu">' + esc(g.bcast || "") + "</span></div>" + (g.note ? '<div class="mu">' + esc(g.note) + "</div>" : "") + "</div>";
  h += lineTable(g, d);
  if (o) {
    h += "<h2>Lines (" + esc(o.src) + ")</h2><div class=\"card flat\"><table class=\"tbl\"><tr><th></th><th>Now</th><th>Opened</th></tr>" +
      (o.spreadH != null ? "<tr><td>Spread (" + esc(g.h.abbr) + ")</td><td>" + (o.spreadH > 0 ? "+" : "") + o.spreadH + (o.spreadHOdds != null ? " (" + sgn(o.spreadHOdds) + ")" : "") + "</td><td>" + (o.spreadHo != null ? (o.spreadHo > 0 ? "+" : "") + o.spreadHo : "—") + "</td></tr>" : "") +
      (o.total != null ? "<tr><td>Total</td><td>" + o.total + (o.overOdds != null ? " (o " + sgn(o.overOdds) + " / u " + sgn(o.underOdds) + ")" : "") + "</td><td>" + (o.totalo != null ? o.totalo : "—") + "</td></tr>" : "") +
      (o.mlA != null ? "<tr><td>Moneyline " + esc(g.a.abbr) + "</td><td>" + sgn(o.mlA) + "</td><td>" + (o.mlAo != null ? sgn(o.mlAo) : "—") + "</td></tr><tr><td>Moneyline " + esc(g.h.abbr) + "</td><td>" + sgn(o.mlH) + "</td><td>" + (o.mlHo != null ? sgn(o.mlHo) : "—") + "</td></tr>" : "") +
      "</table>" + (o.mlA != null ? (function () { var nv = E.noVig(o.mlA, o.mlH); return '<div class="mu" style="margin-top:6px">Market win chance (vig removed): ' + esc(g.a.abbr) + " " + pct(nv.a, 0) + ", " + esc(g.h.abbr) + " " + pct(nv.h, 0) + ".</div>"; })() : "") + "</div>";
  }
  var ps = picksForGame(g);
  if (ps.length) {
    h += "<h2>My picks for this game</h2>";
    ps.forEach(function (p) {
      var placed = placedFor(p);
      h += '<div class="card flat"><div class="pk-h"><div class="t">' + esc(p.label) + '</div><div class="pk-u ' + (p.u > 0 ? "" : "z") + '">' + (p.u > 0 ? uf(p.u) : "Pass") + '</div></div><div class="sub"><span>Price <b>' + sgn(p.od) + "</b> " + esc(p.src) + "</span><span>Win chance <b>" + pct(p.pu, 0) + "</b></span><span>EV <b class=\"" + cls(p.ev) + '">' + (p.ev * 100).toFixed(1) + "%</b></span></div><div class=\"mu\" style=\"margin-top:6px\">" + esc(p.why) + "</div>" +
        '<div class="row" style="margin-top:8px"><span>' + (placed ? '<span class="tag">Logged ✓</span>' : "") + "</span>" + (p.state === "pre" && !placed ? '<button class="btn sm" data-act="log" data-id="' + esc(p.id) + '">Log it</button>' : "") + "</div></div>";
    });
  }
  var bs = betsForGame(g);
  if (bs.length) h += "<h2>Your bets on this game</h2>" + bs.map(betCard).join("");
  if (d) {
    if (d.winprob != null && g.state === "in") h += '<div class="mu" style="margin-top:8px">Win probability (' + esc(g.h.abbr) + "): <b>" + (d.winprob > 1 ? d.winprob.toFixed(0) : (d.winprob * 100).toFixed(0)) + "%</b></div>";
    if (d.plays.length) h += "<h2>Scoring</h2><div class=\"card flat\">" + d.plays.slice(-14).map(function (p) { return '<div class="leg"><span>' + esc(p.text) + '<div class="mu">' + esc((p.period || "") + (p.clock ? " · " + p.clock : "")) + '</div></span><span class="num"><b>' + esc(p.a != null ? p.a + "-" + p.h : "") + "</b></span></div>"; }).join("") + "</div>";
    if (d.teamStats.length) h += "<h2>Team stats</h2><div class=\"card flat scroll-x\"><table class=\"tbl\"><tr><th></th><th>" + esc(g.a.abbr) + "</th><th>" + esc(g.h.abbr) + "</th></tr>" + d.teamStats.slice(0, 16).map(function (r) { return "<tr><td>" + esc(r.label) + "</td><td>" + esc(r.a) + "</td><td>" + esc(r.h) + "</td></tr>"; }).join("") + "</table></div>";
    if (d.leaders.length) h += "<h2>Leaders</h2><div class=\"card flat\">" + d.leaders.slice(0, 12).map(function (l) { return '<div class="leg"><span>' + esc(l.who || "") + '<div class="mu">' + esc(l.team + " · " + l.cat) + "</div></span><span><b>" + esc(l.val || "") + "</b></span></div>"; }).join("") + "</div>";
    if (d.players.length) h += "<h2>Box score</h2>" + d.players.slice(0, 6).map(function (c) { return '<div class="card flat scroll-x"><div class="mu"><b>' + esc(c.team + " " + c.cat) + "</b></div><table class=\"tbl\"><tr><th></th>" + c.labels.map(function (l) { return "<th>" + esc(l) + "</th>"; }).join("") + "</tr>" + c.rows.map(function (r) { return "<tr><td>" + esc(r.n) + "</td>" + r.s.map(function (x) { return "<td>" + esc(x) + "</td>"; }).join("") + "</tr>"; }).join("") + "</table></div>"; }).join("");
    if (d.injuries.length) h += "<h2>Injuries</h2><div class=\"card flat\">" + d.injuries.map(function (i) { return '<div class="leg"><span>' + esc(i.who || "") + (i.pos ? " (" + esc(i.pos) + ")" : "") + '<div class="mu">' + esc(i.team + (i.detail ? " · " + i.detail : "")) + "</div></span><span>" + esc(i.status || "") + "</span></div>"; }).join("") + "</div>";
    if (d.notes.length || d.series) h += '<div class="mu" style="margin-top:8px">' + esc(d.notes.join(" · ")) + (d.series ? " " + esc(d.series) : "") + "</div>";
  } else if (s.err) h += '<div class="note">Extra game details are not available right now (' + esc(s.err) + "). Scores and lines above still update.</div>";
  else h += '<div class="mu" style="margin-top:10px">Loading game details…</div>';
  h += '<div class="mu" style="margin-top:10px">Updates about every 20 seconds while open.</div>';
  $("shp").innerHTML = h; $("sheet").hidden = false; $("shp").scrollTop = keep;
}

/* ---------- manual bet / bet menu ---------- */
function openGames() {
  var t = today(), tm = X.addDay(t, 1), y = X.addDay(t, -1);
  return gamesList().filter(function (g) { return (g.day === t || g.day === tm || (g.day === y && g.state !== "post")) && g.state !== "off"; })
    .sort(function (a, b) { return a.sp.localeCompare(b.sp) || a.start.localeCompare(b.start); });
}
ACT.add = function () {
  UI.sheet = { type: "add" }; UI.add = { legs: [{}] };
  var b = blocked();
  openSheet(hdr("Add a bet") + (b ? '<div class="alert">' + esc(b) + "</div>" : "") +
    '<label class="f" style="margin-top:10px">What did you bet?<input id="ad1" type="text" placeholder="e.g. Josh Allen over 1.5 passing TDs"></label>' +
    '<div class="g2" style="margin-top:10px"><label class="f">Bet type<select id="ad9"><option>Moneyline</option><option>Spread</option><option>Game total</option><option>Player prop</option><option>Parlay</option><option>Same game parlay</option><option>Futures</option><option>Live bet</option><option>Other</option></select></label>' +
    '<label class="f">Sport<select id="ad4">' + ["NFL", "CFB", "NBA", "NHL", "MLB", "NCAAB", "Soccer", "UFC", "Tennis", "Golf", "Other"].map(function (s) { return "<option>" + s + "</option>"; }).join("") + "</select></label></div>" +
    '<div class="g2" style="margin-top:10px">' + fld("Odds", "ad2", "", { ph: "-110" }) + fld("Stake ($)", "ad3", S.unit, { step: "0.01" }) + "</div>" +
    '<details data-k="addlegs" open style="margin-top:10px"><summary>Track it live (optional)</summary><div class="mu" style="margin:6px 0">Attach the game and the site settles the bet when it ends. Parlays: add one row per leg.</div><div id="legs"></div><button class="btn sm alt" data-act="addleg">Add another leg</button></details>' +
    '<label class="f" style="margin-top:10px">Notes (optional)<input id="ad7" type="text"></label><div id="shm"></div><button class="btn block" style="margin-top:12px" data-act="saveadd" ' + (b ? "disabled" : "") + ">Save bet</button>");
  paintLegs();
};
ACT.addleg = function () { UI.add.legs.push({}); paintLegs(); };
ACT.rmleg = function (t, v) { UI.add.legs.splice(+v, 1); if (!UI.add.legs.length) UI.add.legs.push({}); paintLegs(); };
function paintLegs() {
  var gs = openGames();
  $("legs").innerHTML = UI.add.legs.map(function (l, i) {
    var g = l.eid ? X.index[l.eid] : null;
    var opts = '<option value="">Choose a game…</option>' + gs.map(function (x) { return '<option value="' + esc(x.id) + '" ' + (l.eid === x.id ? "selected" : "") + ">" + esc(x.sp + ": " + x.a.short + " at " + x.h.short + " (" + dayLabel(x.day).slice(0, 3) + " " + timeOf(x.start) + ")") + "</option>"; }).join("");
    var types = [["ml", "Moneyline"], ["spread", "Spread"], ["over", "Over"], ["under", "Under"]];
    var team = g && (l.t === "ml" || l.t === "spread") ? '<label class="f">Team<select data-leg="' + i + '" data-f="side"><option value="a" ' + (l.side === "a" ? "selected" : "") + ">" + esc(g.a.name) + '</option><option value="h" ' + (l.side === "h" ? "selected" : "") + ">" + esc(g.h.name) + "</option></select></label>" : "";
    var line = l.t && l.t !== "ml" ? '<label class="f">Line<input data-leg="' + i + '" data-f="line" type="number" step="0.5" value="' + (l.line == null ? "" : l.line) + '" placeholder="-6.5"></label>' : "";
    return '<div class="card flat" style="margin:8px 0"><div class="row"><b>Leg ' + (i + 1) + '</b><button class="x" data-act="rmleg" data-v="' + i + '">Remove</button></div><label class="f">Game<select data-leg="' + i + '" data-f="eid">' + opts + '</select></label><div class="g2" style="margin-top:8px"><label class="f">Bet<select data-leg="' + i + '" data-f="t">' + types.map(function (x) { return '<option value="' + x[0] + '" ' + ((l.t || "ml") === x[0] ? "selected" : "") + ">" + x[1] + "</option>"; }).join("") + "</select></label>" + team + line + "</div></div>";
  }).join("");
}
function legChange(t) {
  var i = +t.dataset.leg, f = t.dataset.f, l = UI.add.legs[i]; if (!l) return;
  if (f === "line") l.line = t.value === "" ? null : +t.value; else l[f] = t.value;
  if (f === "eid") { l.side = l.side || "a"; if (!l.t) l.t = "ml"; }
  if (f === "t" && !l.side) l.side = "a";
  if (f === "t" || f === "eid") paintLegs();
}
ACT.saveadd = function () {
  var l = $("ad1").value.trim(), o = +$("ad2").value, s = +$("ad3").value;
  if (!E.okOdds(o) || !(s > 0)) { $("shm").innerHTML = '<div class="alert">Add valid odds and a stake above zero.</div>'; return; }
  var lg = [], i, x;
  for (i = 0; i < UI.add.legs.length; i++) {
    x = UI.add.legs[i]; if (!x.eid) continue;
    var g = X.index[x.eid], t = x.t || "ml", leg = { sp: g.sp, eid: g.id, t: t, k: g.a.short + " at " + g.h.short };
    if (t === "ml" || t === "spread") { leg.side = x.side || "a"; leg.team = leg.side === "a" ? g.a.name : g.h.name; }
    if (t !== "ml") { if (x.line == null || isNaN(x.line)) { $("shm").innerHTML = '<div class="alert">Enter the line for leg ' + (i + 1) + ".</div>"; return; } leg.line = x.line; }
    lg.push(leg);
  }
  if (!l && lg.length) l = (lg.length > 1 ? "Parlay: " : "") + lg.map(function (z) { return legLabel(z); }).join(" + ");
  if (!l) { $("shm").innerHTML = '<div class="alert">Describe the bet.</div>'; return; }
  if (blocked()) return;
  var ty = $("ad9").value; if (lg.length > 1 && ty === "Moneyline") ty = "Parlay";
  BETS.push({ id: nextId(), ts: Date.now(), d: today(), l: l, o: o, s: s, tp: null, r: "open", p: null, sp: lg.length ? lg[0].sp : $("ad4").value, ty: ty, lg: lg, n: $("ad7").value.trim() });
  saveBets(); closeSheet(); toast("Bet added."); autoSettleSoon(); UI.tab = "track"; rerender();
};
ACT.betmenu = function (t, v, id) {
  var b = BETS.filter(function (x) { return x.id === id; })[0]; if (!b) return;
  UI.sheet = { type: "bet", id: id, del: false };
  openSheet(hdr("Manage bet") + '<div style="margin:8px 0"><b>' + esc(b.l) + '</b><div class="mu">' + esc(b.sp || "") + " · " + esc(b.ty || "") + " · logged " + esc(b.d) + "</div></div>" +
    '<div class="mu">Result</div><div class="seg" style="margin:6px 0">' + [["open", "Open", ""], ["win", "Won", "w"], ["loss", "Lost", "l"], ["push", "Push", ""], ["void", "Void", ""]].map(function (x) { return '<button class="' + (b.r === x[0] ? "on " + x[2] : "") + '" data-act="settle" data-id="' + b.id + '" data-v="' + x[0] + '">' + x[1] + "</button>"; }).join("") + "</div>" +
    '<div class="g2" style="margin-top:10px">' + fld("Odds", "mo", b.o) + fld("Stake ($)", "ms", b.s, { step: "0.01" }) + "</div>" +
    '<label class="f" style="margin-top:10px">Cashed out for ($, leave blank if not)<input id="mc" type="number" step="0.01" value="' + (b.co == null ? "" : b.co) + '" inputmode="decimal"></label>' +
    '<label class="f" style="margin-top:10px">Notes<input id="mn" type="text" value="' + esc(b.n || "") + '"></label><div id="shm"></div>' +
    '<div class="row" style="margin-top:12px"><button class="btn" data-act="savebet" data-id="' + b.id + '">Save changes</button><button class="btn alt" data-act="delbet" data-id="' + b.id + '">Delete bet</button></div>');
};
ACT.savebet = function (t, v, id) {
  var b = BETS.filter(function (x) { return x.id === id; })[0]; if (!b) return;
  var o = +$("mo").value, s = +$("ms").value;
  if (!E.okOdds(o) || !(s > 0)) { $("shm").innerHTML = '<div class="alert">Enter valid odds and a stake.</div>'; return; }
  b.o = o; b.s = s; b.n = $("mn").value.trim();
  var co = $("mc").value; b.co = co === "" ? null : +co;
  if (b.co != null && b.r === "open") { b.r = b.co > b.s ? "win" : b.co < b.s ? "loss" : "push"; b.st = Date.now(); }
  saveBets(); closeSheet(); toast("Saved."); rerender();
};
ACT.delbet = function (t, v, id) {
  if (!UI.sheet || !UI.sheet.del) { UI.sheet.del = true; t.textContent = "Tap again to delete"; t.classList.add("ls"); return; }
  BETS = BETS.filter(function (x) { return x.id !== id; }); saveBets(); closeSheet(); toast("Bet deleted."); rerender();
};
ACT.settle = function (t, v, id) {
  var b = BETS.filter(function (x) { return x.id === id; })[0]; if (!b) return;
  b.r = v; b.st = v === "open" ? null : Date.now(); if (v === "open") b.co = null;
  saveBets(); if (UI.sheet && UI.sheet.type === "bet") closeSheet();
  toast(v === "open" ? "Bet reopened." : "Marked " + v + "."); rerender();
};

/* ---------- automatic settlement from final scores ---------- */
var settling = false, settleQueued = false;
function applyAuto() {
  var n = 0, names = [];
  BETS.forEach(function (b) {
    var r = E.betAuto(b, function (l) { return X.index[String(l.eid)] || null; });
    if (r) { b.r = r; b.st = Date.now(); n++; names.push(b.l + " (" + r + ")"); }
  });
  if (n) { saveBets(); toast(n + (n === 1 ? " bet" : " bets") + " settled: " + names.join("; ")); }
  return n;
}
function autoSettle() {
  if (settling) { settleQueued = true; return Promise.resolve(); }
  settling = true;
  var jobs = [];
  BETS.forEach(function (b) {
    if (b.r !== "open" || !b.lg) return;
    b.lg.forEach(function (l) { if (l.t !== "prop" && !(l.eid && X.index[String(l.eid)])) jobs.push(X.resolveLeg(l, b)); });
  });
  return Promise.all(jobs).then(function () { if (jobs.length) saveBets(); applyAuto(); }).catch(function () { }).then(function () {
    settling = false; if (settleQueued) { settleQueued = false; } rerender();
  });
}
function autoSettleSoon() { setTimeout(autoSettle, 50); }

/* ---------- settings, safety, backup ---------- */
ACT.settings = function () {
  UI.sheet = { type: "settings" };
  var mw = Object.keys(S.mw).map(function (k) { return fld(k + " model weight (%)", "mw-" + k, Math.round(S.mw[k] * 100), { style: "" }).replace("<input ", '<input data-setting="mw.' + k + '" data-scale="100" '); }).join("");
  var sf = function (k, label, scale) { return fld(label, "s-" + k, scale ? Math.round(S[k] * scale * 10) / 10 : S[k]).replace("<input ", '<input data-setting="' + k + '"' + (scale ? ' data-scale="' + scale + '"' : "") + " "); };
  openSheet(hdr("Settings") +
    "<h2>Bankroll</h2><div class=\"g2\">" + sf("unit", "1 unit = ($)") + sf("start", "Starting bankroll ($)") + sf("lossLimit", "Daily loss limit ($, 0 = off)") + sf("betCap", "Max bets per day (0 = off)") + "</div>" +
    '<label class="f" style="margin-top:10px">Theme<select data-setting="theme"><option value="">Match my phone</option><option value="light" ' + (S.theme === "light" ? "selected" : "") + '>Light</option><option value="dark" ' + (S.theme === "dark" ? "selected" : "") + ">Dark</option></select></label>" +
    '<details data-k="modelset" ' + (UI.open.modelset ? "open" : "") + '><summary>Model settings (change the algorithm)</summary><div class="mu" style="margin:6px 0">Each pick blends my model with the sportsbook price. A higher model weight trusts my number more; a lower one trusts the market more. Defaults: NFL 5% (tested on 5,000 games), others higher because they are less tested.</div><div class="g2">' + mw + "</div>" +
    '<div class="g3" style="margin-top:10px">' + sf("t1", "EV for 0.5u (%)", 100) + sf("t2", "EV for 1u (%)", 100) + sf("t3", "EV for 1.5u (%)", 100) + sf("ucap", "Max units") + sf("minp", "Min win chance (%)", 100) + sf("gap", "Model-vs-market gap cap (pts)", 100) + '</div><div style="margin-top:10px"><button class="btn sm alt" data-act="resetmodel">Reset model settings</button></div></details>' +
    '<details data-k="dataset" ' + (UI.open.dataset ? "open" : "") + "><summary>Data and connection</summary><div class=\"mu\" style=\"margin:6px 0\">Picks updated: " + esc(SLATE && SLATE.asof ? new Date(SLATE.asof).toLocaleString() : "never") + ". Live feed: " + (X.status.ok === true ? "connected" : X.status.ok === false ? "error (" + esc(X.status.err) + ")" : "not tried yet") + '.</div><div id="testout" class="mu"></div><button class="btn sm alt" data-act="testfeed">Test connection</button> <button class="btn sm alt" data-act="reloadslate">Reload today\'s picks</button></details>' +
    '<div class="row" style="margin-top:14px"><button class="btn sm alt" data-act="safe">Play it safe</button><button class="btn sm alt" data-act="export">Back up</button><button class="btn sm alt" data-act="import">Restore</button></div>');
};
function setSetting(t) {
  var k = t.dataset.setting, sc = +t.dataset.scale || 1, v = t.tagName === "SELECT" ? t.value : parseFloat(t.value);
  if (k === "theme") { S.theme = v; saveS(); return; }
  if (!isFinite(v) || v < 0) { toast("Enter a number."); return; }
  v = v / sc;
  if (k.indexOf("mw.") === 0) S.mw[k.slice(3)] = Math.min(1, v); else S[k] = v;
  saveS(); buildPicks(); rerender();
}
ACT.resetmodel = function () {
  var d = JSON.parse(JSON.stringify(E.DEF));
  S.mw = d.mw; ["gap", "minp", "t1", "t2", "t3", "ucap", "pcap", "tcap", "shr", "wthr", "weff", "tsd", "mkt"].forEach(function (k) { S[k] = d[k]; });
  saveS(); buildPicks(); rerender(); ACT.settings(); toast("Model settings reset.");
};
ACT.testfeed = function () {
  var o = $("testout"); o.textContent = "Testing…";
  X.test().then(function (r) { o.innerHTML = r.map(esc).join("<br>"); rerender(); });
};
ACT.reloadslate = function () { loadSlate().then(function () { toast(SLATE ? "Picks reloaded." : "No picks available."); }); };
ACT.safe = function () {
  UI.sheet = { type: "safe" };
  var cl = coolLeft();
  openSheet(hdr("Play it safe") +
    '<div class="mu" style="margin:8px 0">Limits help you stay in control. They apply to bets you log here.</div><div class="g2">' +
    fld("Daily loss limit ($, 0 = off)", "sl1", S.lossLimit) + fld("Max bets per day (0 = off)", "sl2", S.betCap) + '</div><button class="btn sm" style="margin-top:8px" data-act="savesafe">Save limits</button>' +
    "<h2>Take a break</h2>" + (cl ? '<div class="alert">Cool-off active for ' + coolText() + ". It cannot be shortened.</div>" : '<div class="mu" style="margin-bottom:6px">Switch off logging for a while. Once started it cannot be undone.</div><div class="row"><button class="btn sm alt" data-act="cool" data-v="24">24 hours</button><button class="btn sm alt" data-act="cool" data-v="168">7 days</button><button class="btn sm alt" data-act="cool" data-v="720">30 days</button></div>') +
    '<h2>Get help</h2><div class="card flat">If gambling is causing problems, free confidential help is available any time: <b>1-800-GAMBLER</b> (call or text 1-800-522-4700) or <b>ncpgambling.org</b>. You must be 21 or older (18 in some states) to bet.</div>');
};
ACT.savesafe = function () { S.lossLimit = Math.max(0, +$("sl1").value || 0); S.betCap = Math.max(0, Math.round(+$("sl2").value || 0)); saveS(); toast("Limits saved."); rerender(); };
ACT.cool = function (t, v) { store.set("cool", Date.now() + (+v) * 3600000); toast("Cool-off started."); ACT.safe(); rerender(); };

function backupObj() { return { app: "bettingdesk", v: 3, at: new Date().toISOString(), bets: BETS, settings: S, plog: PLOG, star: STAR }; }
function download(name, text, type) {
  try {
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" })); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  } catch (e) { toast("Could not start the download. Copy the text instead."); }
}
ACT.export = function () {
  var txt = JSON.stringify(backupObj());
  openSheet(hdr("Back up") + '<div class="mu" style="margin:8px 0">Your bets live on this device. Save this file or copy the text, and use Restore on another device to bring everything over.</div><textarea id="expt" readonly>' + esc(txt) + '</textarea><div class="row" style="margin-top:8px"><button class="btn sm" data-act="copyexp">Copy</button><button class="btn sm alt" data-act="dlexp">Download file</button></div>');
};
ACT.copyexp = function () {
  var el = $("expt"); el.select();
  if (navigator.clipboard) navigator.clipboard.writeText(el.value).then(function () { toast("Copied."); }, function () { document.execCommand("copy"); toast("Copied."); });
  else { document.execCommand("copy"); toast("Copied."); }
};
ACT.dlexp = function () { download("betting-desk-backup-" + today() + ".json", JSON.stringify(backupObj()), "application/json"); };
ACT.csv = function () { download("betting-desk-bets-" + today() + ".csv", E.csv(BETS), "text/csv"); };
ACT.import = function () {
  openSheet(hdr("Restore or import") + '<div class="mu" style="margin:8px 0">Paste a backup from this app or from the earlier Betting Desk web page.</div><textarea id="impt" placeholder="Paste backup text here"></textarea><div id="shm"></div><div class="row" style="margin-top:8px"><button class="btn sm" data-act="doimport" data-v="merge">Add to what I have</button><button class="btn sm alt" data-act="doimport" data-v="replace">Replace everything</button></div>');
};
function normBet(b) {
  var n = Object.assign({}, b);
  if (!n.id) n.id = n.sid ? "legacy-" + n.sid : nextId();
  n.ts = n.ts || (n.d ? Date.parse(n.d + "T12:00:00") : Date.now()); n.st = n.st || n.ts;
  if (n.lg) n.lg = n.lg.map(function (l) { return Object.assign({ sp: n.sp }, l); });
  return n;
}
ACT.doimport = function (t, mode) {
  var j; try { j = JSON.parse($("impt").value); } catch (e) { $("shm").innerHTML = '<div class="alert">That does not look like a backup. Paste the whole text.</div>'; return; }
  if (!j || !Array.isArray(j.bets)) { $("shm").innerHTML = '<div class="alert">No bets found in that text.</div>'; return; }
  var incoming = j.bets.map(normBet);
  if (mode === "replace") BETS = incoming;
  else {
    var keys = {}; BETS.forEach(function (b) { keys[b.id] = 1; keys[b.d + "|" + b.l + "|" + b.o + "|" + b.s] = 1; });
    incoming.forEach(function (b) { var k2 = b.d + "|" + b.l + "|" + b.o + "|" + b.s; if (!keys[b.id] && !keys[k2]) BETS.push(b); });
  }
  if (j.app === "bettingdesk" && j.settings) { for (var k in j.settings) if (k in S && k !== "mw") S[k] = j.settings[k]; if (j.settings.mw) for (var m in j.settings.mw) S.mw[m] = j.settings.mw[m]; if (j.settings.theme) S.theme = j.settings.theme; }
  else {
    if (isFinite(j.start)) S.start = +j.start;
    if (j.gr) { if (isFinite(j.gr.gl)) S.lossLimit = +j.gr.gl; if (isFinite(j.gr.gm)) S.betCap = +j.gr.gm; }
  }
  if (j.plog) for (var pk in j.plog) if (!PLOG[pk]) PLOG[pk] = j.plog[pk];
  if (j.star) for (var sk in j.star) STAR[sk] = j.star[sk];
  saveBets(); savePlog(); saveStar(); saveS(); closeSheet(); toast("Imported " + incoming.length + " bets."); buildPicks(); autoSettleSoon(); rerender();
};
