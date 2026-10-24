/* Betting Desk engine: odds math, model sizing, settlement and stats. No DOM here, so it can be tested in Node. */
(function (root) {
  var E = {};

  /* ---------- odds math ---------- */
  E.dec = function (a) { return a > 0 ? 1 + a / 100 : 1 + 100 / -a; };
  E.am = function (d) { return d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1)); };
  E.okOdds = function (a) { return isFinite(a) && a !== 0 && (a >= 100 || a <= -100); };
  E.impl = function (a) { return 1 / E.dec(a); };
  E.noVig = function (aA, aH) { var x = E.impl(aA), y = E.impl(aH); return { a: x / (x + y), h: y / (x + y), hold: x + y - 1 }; };
  E.sgn = function (a) { return a > 0 ? "+" + a : String(a); };
  E.pct = function (x, d) { return (x * 100).toFixed(d == null ? 1 : d) + "%"; };
  E.money = function (x) { return (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2); };
  E.round2 = function (x) { return Math.round(x * 100) / 100; };
  E.ncdf = function (z) {
    var t = 1 / (1 + .2316419 * Math.abs(z)), d = .3989423 * Math.exp(-z * z / 2),
      p = d * t * (.3193815 + t * (-.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  };
  E.parlay = function (odds) {
    var d = 1; odds.forEach(function (o) { d *= E.dec(o); });
    return { dec: d, am: E.am(d) };
  };
  /* Kelly fraction of bankroll for win chance p at decimal odds d */
  E.kelly = function (p, d) { var b = d - 1; return Math.max(0, (b * p - (1 - p)) / b); };
  /* equal-profit hedge stake on the other side */
  E.hedge = function (stake, oddsOrig, oddsHedge) {
    var d1 = E.dec(oddsOrig), d2 = E.dec(oddsHedge), h = stake * d1 / d2;
    return { hedge: h, profit: stake * d1 - stake - h };
  };

  /* ---------- settings ---------- */
  E.DEF = {
    unit: 5, start: 190, lossLimit: 50, betCap: 0, cool: 0,
    mw: { NFL: .05, CFB: .10, NBA: .35, NHL: .35, MLB: .25, NCAAB: .15 },
    gap: .10, minp: .30, t1: .02, t2: .05, t3: .09, ucap: 1.5, pcap: 1, tcap: .5,
    shr: .15, wthr: 15, weff: 1.4, tsd: 13.3, mkt: .5, nbaEarly: 10, nbaCap: .5
  };
  E.units = function (ev, S, cap) {
    var u = ev < S.t1 ? 0 : ev < S.t2 ? .5 : ev < S.t3 ? 1 : ev < S.t3 * 1.6 ? 1.5 : 2;
    return Math.min(u, cap == null ? S.ucap : cap);
  };

  /* ---------- team name matching ---------- */
  var norm = function (s) { return String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim(); };
  E.norm = norm;
  /* does slate name (e.g. "Trail Blazers", "BYU") refer to this normalized team? */
  E.sameTeam = function (name, t) {
    var n = norm(name); if (!n) return false;
    return [t.nick, t.short, t.name, t.abbr].some(function (x) { return norm(x) === n; });
  };
  E.sideOf = function (name, g) { return E.sameTeam(name, g.h) ? "h" : E.sameTeam(name, g.a) ? "a" : null; };
  E.findGame = function (games, sp, away, home) {
    return games.filter(function (g) { return g.sp === sp && E.sameTeam(away, g.a) && E.sameTeam(home, g.h); })[0] || null;
  };

  /* ---------- NBA rating model ---------- */
  E.NBAC = { hfa: .30, k: .154, pw: .8, pn: 7, b2b: .24, wtw: .65, wpg: 2.7 };
  E.nbaPrior = function (t, pri) {
    var l = (pri.last || {})[t] || 0, w = (pri.wins || {})[t];
    return w == null ? l : E.NBAC.wtw * (w - 41) / E.NBAC.wpg + (1 - E.NBAC.wtw) * l;
  };
  E.nbaRating = function (t, pri, season) {
    var s = (season || {})[t] || { m: 0, n: 0 };
    return (s.m + E.NBAC.pn * E.NBAC.pw * E.nbaPrior(t, pri)) / (s.n + E.NBAC.pn);
  };
  /* games: [{d,a,h,when,adjH,adjA,b2bH,b2bA}] -> pick rows */
  E.nbaRows = function (games, pri, season) {
    return (games || []).map(function (g) {
      var rh = E.nbaRating(g.h, pri, season), ra = E.nbaRating(g.a, pri, season),
        gap = rh - ra + (g.adjH || 0) - (g.adjA || 0),
        z = E.NBAC.hfa + E.NBAC.k * gap - (g.b2bH ? E.NBAC.b2b : 0) + (g.b2bA ? E.NBAC.b2b : 0),
        ph = 1 / (1 + Math.exp(-z)), pick = ph >= .5 ? g.h : g.a, p = ph >= .5 ? ph : 1 - ph;
      return {
        type: "ml", d: g.d, sp: "NBA", away: g.a, home: g.h, when: g.when, pick: pick, p: p,
        why: "Rating (points better than average): " + g.h + " " + rh.toFixed(1) + ", " + g.a + " " + ra.toFixed(1) +
          ", gap " + gap.toFixed(1) + " including injury adjustments (" + (g.adjH || 0) + " home, " + (g.adjA || 0) + " away)" +
          ((g.b2bH || g.b2bA) ? ", back-to-back adjustment applied" : "") + ". Ratings start from preseason win totals blended with last season, then update with results."
      };
    });
  };

  /* ---------- pick evaluation ---------- */
  /* row: {type:"ml", sp, away, home, pick, p, od?, mp?}; game: normalized ESPN game or null */
  E.evalML = function (row, game, S, ctx) {
    ctx = ctx || {};
    var side = game ? E.sideOf(row.pick, game) : null;
    if (!side) side = norm(row.pick) === norm(row.home) ? "h" : "a";
    var mw = (S.mw && S.mw[row.sp] != null) ? S.mw[row.sp] : .25;
    var od = null, src = "", pm = null, live = false;
    var o = game && game.odds;
    if (o && o.mlA != null && o.mlH != null) {
      var nv = E.noVig(o.mlA, o.mlH);
      od = side === "h" ? o.mlH : o.mlA; pm = side === "h" ? nv.h : nv.a; src = o.src || "DraftKings"; live = true;
    } else if (row.od != null) {
      od = row.od; pm = row.mp != null ? row.mp : Math.max(.02, E.impl(od) - .0225); src = row.src || "reported";
    } else {
      var mq = row.mp != null ? row.mp : .5 + S.mkt * (row.p - .5);
      od = E.am(1 / Math.min(.95, mq + .0225)); pm = mq; src = "estimated";
    }
    var pu = mw * row.p + (1 - mw) * pm, d = E.dec(od), ev = pu * d - 1;
    var u = pu < S.minp ? 0 : E.units(ev, S, S.ucap);
    var capped = false;
    if (u > 0 && Math.abs(row.p - pm) > S.gap) { u = Math.min(u, .5); capped = true; }
    var early = false;
    if (row.sp === "NBA" && ctx.nbaGames) {
      var n = Math.min(ctx.nbaGames(row.away), ctx.nbaGames(row.home));
      if (n < S.nbaEarly) { early = true; u = Math.min(u, S.nbaCap); }
    }
    return { od: od, src: src, live: live, pm: pm, pu: pu, ev: ev, u: u, capped: capped, early: early, side: side, be: 1 / d };
  };
  /* player prop: row {pl, s, ty, line, dir, avg, adj, odds} ; PT table below */
  E.PT = {
    rb_rush: { l: "Running back rushing yards", w: .61, b: 54.9, cv: .61, z: .15 },
    qb_rush: { l: "Quarterback rushing yards", w: .77, b: 19.3, cv: .78, z: .2 },
    rec: { l: "WR/TE receiving yards", w: .63, b: 43.9, cv: .67, z: .18 },
    qb_pass: { l: "Quarterback passing yards", w: .54, b: 226.3, cv: .34, z: 0 }
  };
  E.evalProp = function (r, S) {
    var c = E.PT[r.ty]; if (!c) return null;
    var mu = (c.w * r.avg + (1 - c.w) * c.b) * (1 + (r.adj || 0)), sd = c.cv * mu, med = mu * (1 - c.z * c.cv),
      po = 1 - E.ncdf((r.line - med) / sd), pr = r.dir === "over" ? po : 1 - po, p = .5 + (pr - .5) * (1 - S.shr),
      ev = p * E.dec(r.odds) - 1;
    return { od: r.odds, src: "assumed", pu: p, pm: E.impl(r.odds), ev: ev, u: E.units(ev, S, S.pcap), mu: mu, sd: sd, pr: pr, be: E.impl(r.odds) };
  };
  /* windy NFL total under: row {line, w, od?} */
  E.evalWindTotal = function (r, S, game) {
    if (r.w == null || r.w < S.wthr) return null;
    var od = r.od != null ? r.od : -110;
    if (game && game.odds && game.odds.underOdds != null) od = game.odds.underOdds;
    var pu = E.ncdf(S.weff / S.tsd), ev = pu * E.dec(od) - 1;
    return { od: od, src: game && game.odds && game.odds.underOdds != null ? game.odds.src : "assumed", pu: pu, pm: E.impl(od), ev: ev, u: E.units(ev, S, S.tcap), be: E.impl(od) };
  };

  /* ---------- settlement ---------- */
  /* leg: {t:"ml"|"spread"|"under"|"over"|"prop", team, side, line} ; g: normalized game */
  E.legRes = function (l, g) {
    if (l.t === "prop") return { s: "", txt: "mark this one yourself" };
    if (!g || g.state === "pre") return { s: "", txt: "not started" };
    var fin = g.state === "post", m, t;
    var side = l.side || E.sideOf(l.team, g);
    var diff = function () { return side === "h" ? g.h.score - g.a.score : g.a.score - g.h.score; };
    if (l.t === "ml") {
      m = diff();
      if (fin) return m === 0 ? { s: "p", txt: "push" } : { s: m > 0 ? "w" : "l", txt: m > 0 ? "won" : "lost" };
      return { s: "", txt: m > 0 ? "leading" : m < 0 ? "trailing" : "tied", lead: m > 0 ? 1 : m < 0 ? -1 : 0 };
    }
    if (l.t === "under" || l.t === "over") {
      t = g.a.score + g.h.score; var u = l.t === "under";
      if (fin) return t === l.line ? { s: "p", txt: "push" } : { s: (t < l.line) === u ? "w" : "l", txt: (t < l.line) === u ? "won" : "lost" };
      if (u && t > l.line) return { s: "l", txt: "total " + t + ", over the line", lead: -1 };
      if (!u && t > l.line) return { s: "w", txt: "total " + t + ", over the line", lead: 1 };
      return { s: "", txt: "total " + t + " (line " + l.line + ")", lead: u ? 1 : -1 };
    }
    if (l.t === "spread") {
      m = diff() + l.line;
      if (fin) return m === 0 ? { s: "p", txt: "push" } : { s: m > 0 ? "w" : "l", txt: m > 0 ? "won" : "lost" };
      return { s: "", txt: m > 0 ? "covering" : m < 0 ? "not covering" : "on the number", lead: m > 0 ? 1 : m < 0 ? -1 : 0 };
    }
    return { s: "", txt: "" };
  };
  /* getGame(leg) -> normalized game or null. Returns "win" | "loss" | "push" | "" (undecided) */
  E.betAuto = function (b, getGame) {
    if (b.r !== "open" || !b.lg || !b.lg.length) return "";
    var rs = b.lg.map(function (l) { return E.legRes(l, getGame(l)); }), i, pending = false, push = 0;
    for (i = 0; i < rs.length; i++) { if (rs[i].s === "l") return "loss"; if (rs[i].s === "") pending = true; if (rs[i].s === "p") push++; }
    if (pending) return "";
    if (push === rs.length) return "push";
    if (push && rs.length > 1) return "";   /* parlay with a pushed leg: payout changes, so you confirm it */
    return "win";
  };

  /* ---------- bets and stats ---------- */
  E.profit = function (b) {
    if (b.co != null && E.settled(b)) return b.co - b.s;     /* cashed out for b.co */
    if (b.r === "win") return b.tp > b.s ? b.tp - b.s : b.s * (E.dec(b.o) - 1);
    if (b.r === "loss") return -b.s;
    return 0;
  };
  E.settled = function (b) { return b.r === "win" || b.r === "loss" || b.r === "push"; };
  E.summary = function (bets, unit) {
    var w = 0, l = 0, p = 0, staked = 0, prof = 0, open = 0, openRisk = 0;
    bets.forEach(function (b) {
      if (b.r === "open") { open++; openRisk += b.s; return; }
      if (b.r === "void") return;
      if (b.r === "win") w++; else if (b.r === "loss") l++; else p++;
      staked += b.s; prof += E.profit(b);
    });
    return { w: w, l: l, p: p, staked: staked, profit: prof, units: unit ? prof / unit : 0, roi: staked ? prof / staked : 0, open: open, openRisk: openRisk, n: w + l + p };
  };
  E.group = function (bets, keyFn, unit) {
    var m = {};
    bets.forEach(function (b) { var k = keyFn(b); if (k == null) return; (m[k] = m[k] || []).push(b); });
    return Object.keys(m).map(function (k) { var s = E.summary(m[k], unit); s.key = k; return s; })
      .filter(function (s) { return s.n > 0; }).sort(function (a, b) { return b.n - a.n; });
  };
  E.oddsBucket = function (o) { return o <= -200 ? "Heavy favorites (-200 or shorter)" : o < 0 ? "Favorites (-199 to -100)" : o < 200 ? "Underdogs (+100 to +199)" : "Long shots (+200 and up)"; };
  /* bankroll series: [{t,label,v}] starting at start, one point per settled bet by settle order (ts) */
  E.series = function (bets, start) {
    var s = bets.filter(E.settled).sort(function (a, b) { return (a.st || a.ts || 0) - (b.st || b.ts || 0); }), v = start, out = [{ i: 0, v: v }];
    s.forEach(function (b, i) { v += E.profit(b); out.push({ i: i + 1, v: v, b: b }); });
    return out;
  };
  E.streak = function (bets) {
    var s = bets.filter(function (b) { return b.r === "win" || b.r === "loss"; }).sort(function (a, b) { return (a.st || a.ts || 0) - (b.st || b.ts || 0); });
    if (!s.length) return "";
    var last = s[s.length - 1].r, n = 0;
    for (var i = s.length - 1; i >= 0 && s[i].r === last; i--) n++;
    return n + (last === "win" ? " win" : " loss") + (n > 1 && last === "win" ? "s" : n > 1 ? "es" : "") + " in a row";
  };
  /* daily guardrails */
  E.guard = function (bets, day, S) {
    var n = 0, net = 0;
    bets.forEach(function (b) { if (b.d === day) { n++; net += E.profit(b); } });
    var loss = Math.max(0, -net), msg = "", hit = false;
    if (S.betCap > 0 && n >= S.betCap) { hit = true; msg = "You have logged " + n + " bets today, which is your daily maximum."; }
    if (S.lossLimit > 0 && loss >= S.lossLimit) { hit = true; msg = (msg ? msg + " " : "") + "Settled losses today are " + E.money(loss) + ", at or past your " + E.money(S.lossLimit) + " limit."; }
    return { n: n, loss: loss, hit: hit, msg: msg };
  };
  E.csv = function (bets) {
    var q = function (x) { return '"' + String(x == null ? "" : x).replace(/"/g, '""') + '"'; };
    var rows = [["Date", "Sport", "Type", "Bet", "Odds", "Stake", "Result", "Profit", "Notes"].map(q).join(",")];
    bets.forEach(function (b) { rows.push([b.d, b.sp, b.ty, b.l, b.o, b.s, b.r, E.round2(E.profit(b)), b.n].map(q).join(",")); });
    return rows.join("\n");
  };

  if (typeof module !== "undefined" && module.exports) module.exports = E; else root.E = E;
})(typeof window !== "undefined" ? window : this);
