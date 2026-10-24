/* Turns the daily slate (data/slate.json) plus live ESPN prices into recommended bets. */
function gamesList() { return Object.keys(X.index).map(function (i) { return X.index[i]; }); }
function gameForRow(row) {
  var c = gamesList().filter(function (g) { return g.sp === row.sp && E.sameTeam(row.away, g.a) && E.sameTeam(row.home, g.h); });
  if (!c.length) return null;
  return c.filter(function (g) { return g.day === row.d; })[0] || null;
}
function nbaGamesPlayed(team) { var s = SLATE && SLATE.nba && SLATE.nba.season && SLATE.nba.season[team]; return s ? s.n : 0; }
var pid = function (parts) { return "p-" + parts.join("").replace(/\W/g, ""); };

function slateRows() {
  var rows = [];
  if (!SLATE) return rows;
  (SLATE.picks || []).forEach(function (r) { rows.push(r); });
  if (SLATE.nba && SLATE.nba.games) E.nbaRows(SLATE.nba.games, NBAD, SLATE.nba.season).forEach(function (r) { rows.push(r); });
  (SLATE.totals || []).forEach(function (r) { rows.push(Object.assign({ type: "total" }, r)); });
  (SLATE.props || []).forEach(function (r) { rows.push(Object.assign({ type: "prop" }, r)); });
  return rows;
}

function buildPicks() {
  var out = [], ctx = { nbaGames: nbaGamesPlayed };
  slateRows().forEach(function (r) {
    var g = gameForRow(r), base = { d: r.d, sp: r.sp, type: r.type || "ml", away: r.away, home: r.home, g: g, row: r, why: r.why || r.note || "", when: g ? timeOf(g.start) : (r.when || "") };
    base.game = r.away + " at " + r.home;
    var ev;
    if (base.type === "ml") {
      ev = E.evalML(r, g, S, ctx);
      Object.assign(base, ev, { id: pid([r.d, r.sp, r.away, r.home, "ml", r.pick]), label: r.pick + " ML", pickTeam: r.pick, p: r.p,
        leg: { sp: r.sp, eid: g ? g.id : null, t: "ml", team: r.pick, side: ev.side, k: base.game } });
    } else if (base.type === "bet") {
      var row2 = Object.assign({}, r, { pick: r.label });
      var pm = r.mp != null ? r.mp : Math.max(.02, E.impl(r.od) - .0225), mw = S.mw[r.sp] != null ? S.mw[r.sp] : .25,
        pu = mw * r.p + (1 - mw) * pm, e2 = pu * E.dec(r.od) - 1, u = pu < S.minp ? 0 : E.units(e2, S, S.ucap), cap = false;
      if (u > 0 && Math.abs(r.p - pm) > S.gap) { u = Math.min(u, .5); cap = true; }
      Object.assign(base, { od: r.od, src: r.src || "reported", live: false, pm: pm, pu: pu, ev: e2, u: u, capped: cap, be: E.impl(r.od),
        id: pid([r.d, r.sp, r.away, r.home, "bet", r.label]), label: r.label, p: r.p,
        leg: Object.assign({ sp: r.sp, eid: g ? g.id : null, k: base.game }, r.leg) });
    } else if (base.type === "total") {
      ev = E.evalWindTotal(r, S, g);
      if (!ev) return;
      Object.assign(base, ev, { id: pid([r.d, r.sp, r.away, r.home, "total", r.line]), label: r.away + " at " + r.home + " Under " + r.line, ty: "Game total", p: ev.pu,
        why: r.why || ("Forecast wind about " + r.w + " mph. Windy outdoor NFL games have gone under more often than the line implies; the edge is small, so size is capped."),
        leg: { sp: r.sp, eid: g ? g.id : null, t: "under", line: r.line, k: base.game } });
    } else if (base.type === "prop") {
      ev = E.evalProp(r, S);
      if (!ev) return;
      Object.assign(base, ev, { id: pid([r.d, r.sp, r.pl, r.s, r.line, r.dir]), label: r.pick || (r.pl + " " + r.dir + " " + r.line), ty: "Player prop", p: ev.pu,
        why: (r.note || "") + " Projection " + ev.mu.toFixed(1) + " (typical spread " + ev.sd.toFixed(1) + "). Chance to go " + r.dir + " " + r.line + ": " + pct(ev.pr) + ", pulled toward 50% to " + pct(ev.pu) + ". Price is assumed, so check it.",
        leg: { sp: r.sp, eid: g ? g.id : null, t: "prop", pl: r.pl, s: r.s, dir: r.dir, line: r.line, k: base.game } });
    }
    base.stake = base.u * S.unit;
    base.state = g ? g.state : "pre";
    if (g && g.state !== "pre" && base.type !== "prop") base.res = E.legRes(base.leg, g);
    out.push(base);
  });
  PICKS = out;
  logPicks();
  return out;
}

/* a pick counts as placed when any bet carries its id or the same leg on the same game */
function placedFor(p) {
  for (var i = 0; i < BETS.length; i++) {
    var b = BETS[i]; if (b.r === "void") continue;
    if (b.pid === p.id) return b;
    if (p.leg && p.leg.eid && b.lg && b.lg.length === 1) {
      var l = b.lg[0];
      if (String(l.eid) === String(p.leg.eid) && l.t === p.leg.t && (l.team || "") === (p.leg.team || "") && (l.line == null ? null : l.line) === (p.leg.line == null ? null : p.leg.line) && (l.pl || "") === (p.leg.pl || "")) return b;
    }
  }
  return null;
}

/* the model's own record: every moneyline pick is logged once it is first seen, then graded when the game ends */
function logPicks() {
  var changed = false;
  PICKS.forEach(function (p) {
    if (p.type !== "ml" || !p.g) return;
    var r = PLOG[p.id];
    if (!r) { r = PLOG[p.id] = { d: p.d, sp: p.sp, game: p.game, pick: p.pickTeam, p: p.p, pu: p.pu, od: p.od, u: p.u, eid: p.g.id }; changed = true; }
    else if (p.g.state === "pre" && (r.od !== p.od || r.u !== p.u || r.pu !== p.pu)) { r.od = p.od; r.u = p.u; r.pu = p.pu; changed = true; }
    if (!r.res && p.g.state === "post") {
      var m = p.leg.side === "h" ? p.g.h.score - p.g.a.score : p.g.a.score - p.g.h.score;
      if (m === 0) r.res = "p"; else r.res = m > 0 ? "w" : "l";
      changed = true;
    }
  });
  if (changed) savePlog();
}
function modelRecord() {
  var by = {}, all = { w: 0, l: 0, n: 0, p: 0, units: 0, staked: 0, ps: 0 };
  Object.keys(PLOG).forEach(function (k) {
    var r = PLOG[k]; if (r.res !== "w" && r.res !== "l") return;
    var x = by[r.sp] = by[r.sp] || { w: 0, l: 0, n: 0, units: 0, staked: 0, ps: 0 };
    [x, all].forEach(function (z) {
      z.n++; z.ps += r.p; if (r.res === "w") z.w++; else z.l++;
      if (r.u > 0 && r.od != null) { z.staked += r.u; z.units += r.res === "w" ? r.u * (E.dec(r.od) - 1) : -r.u; }
    });
  });
  return { by: by, all: all };
}

/* what is known about a game for the UI: picks, my bets */
function picksForGame(g) { return PICKS.filter(function (p) { return p.g && p.g.id === g.id; }); }
function betsForGame(g) { return BETS.filter(function (b) { return b.lg && b.lg.some(function (l) { return String(l.eid) === g.id; }); }); }
