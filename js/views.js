/* Screens. Each render function returns/sets HTML; actions.js handles taps through data-act attributes. */
var SPORT_ORDER = ["NFL", "CFB", "NBA", "NHL", "MLB", "NCAAB"];
var ICON = {
  today: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
  picks: '<svg viewBox="0 0 24 24"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.2 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>',
  scores: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/></svg>',
  track: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  tools: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M12 12h2M16 12h0M8 16h2M12 16h2M16 16h0"/></svg>'
};
var TABS = [["today", "Today"], ["picks", "Picks"], ["scores", "Scores"], ["track", "Tracker"], ["tools", "Tools"]];

function renderNav() {
  var open = BETS.filter(function (b) { return b.r === "open"; }).length;
  $("nav").innerHTML = TABS.map(function (t) {
    var badge = t[0] === "track" && open ? "<i>" + open + "</i>" : "";
    return '<button data-act="tab" data-v="' + t[0] + '" class="' + (UI.tab === t[0] ? "on" : "") + '"><span class="dot">' + ICON[t[0]] + badge + "</span>" + t[1] + "</button>";
  }).join("");
}

/* ---------- shared pieces ---------- */
function logoImg(t) { return t.logo ? '<img class="logo" src="' + esc(t.logo) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' : '<span class="logo"></span>'; }
function statusHtml(g) {
  if (g.state === "in") return '<span class="badge"><i></i>Live</span><div>' + esc(g.detail) + "</div>";
  if (g.state === "post") return "<div><b>" + esc(g.detail || "Final") + "</b></div>";
  if (g.state === "off") return "<div>" + esc(g.detail || "Postponed") + "</div>";
  return "<div><b>" + esc(timeOf(g.start)) + "</b></div>" + (g.bcast ? "<div>" + esc(g.bcast) + "</div>" : "");
}
function oddsLine(g) {
  var o = g.odds; if (!o) return "";
  var bits = [];
  if (o.spreadH != null) {
    var mv = o.spreadHo != null && o.spreadHo !== o.spreadH ? ' <span class="' + (o.spreadH < o.spreadHo ? "line-up" : "line-dn") + '">(opened ' + (o.spreadHo > 0 ? "+" : "") + o.spreadHo + ")</span>" : "";
    bits.push("Spread <b>" + esc(g.h.abbr) + " " + (o.spreadH > 0 ? "+" : "") + o.spreadH + "</b>" + mv);
  }
  if (o.total != null) bits.push("Total <b>" + o.total + "</b>");
  if (o.mlA != null && o.mlH != null) bits.push("ML <b>" + esc(g.a.abbr) + " " + sgn(o.mlA) + " / " + esc(g.h.abbr) + " " + sgn(o.mlH) + "</b>");
  return bits.length ? bits.join(" · ") + " · " + esc(o.src) : "";
}
function gameRow(g, opts) {
  opts = opts || {};
  var done = g.state === "post", aw = done && g.a.score > g.h.score, hw = done && g.h.score > g.a.score;
  var showScore = g.state !== "pre";
  var tm = function (t, w, dim) {
    return '<div class="tm ' + (w ? "w" : "") + " " + (dim ? "dim" : "") + '"><span class="nm">' + logoImg(t) + (t.rank ? '<span class="rk">' + t.rank + "</span>" : "") + "<span>" + esc(t.name) + '</span></span><b>' + (showScore ? t.score : (t.rec ? '<span class="mu" style="font:500 12px var(--body)">' + esc(t.rec) + "</span>" : "")) + "</b></div>";
  };
  var tags = "";
  picksForGame(g).forEach(function (p) { if (p.type !== "prop") tags += '<span class="tag ' + (p.u > 0 ? "" : "nt") + '">' + (p.u > 0 ? "Pick: " : "Lean: ") + esc(p.label) + "</span>"; });
  betsForGame(g).forEach(function (b) { tags += '<span class="tag am">Your bet: ' + esc(b.l.length > 28 ? b.l.slice(0, 27) + "…" : b.l) + "</span>"; });
  var ol = oddsLine(g);
  return '<div class="game" data-act="game" data-id="' + esc(g.id) + '"><div class="stack" style="margin:0">' + tm(g.a, aw, done && !aw) + tm(g.h, hw, done && !hw) + "</div>" +
    '<div class="gst">' + statusHtml(g) + '<button class="star ' + (STAR[g.id] ? "on" : "") + '" data-act="star" data-id="' + esc(g.id) + '" aria-label="Follow game">' + (STAR[g.id] ? "★" : "☆") + "</button></div>" +
    ((ol && !opts.noOdds) || tags ? '<div class="odds">' + (tags ? "<div>" + tags + "</div>" : "") + (ol && !opts.noOdds ? "<div>" + ol + "</div>" : "") + "</div>" : "") + "</div>";
}

/* a bet with live leg status */
function legStatus(l) {
  var g = X.index[String(l.eid)] || null;
  var r = E.legRes(l, g);
  var score = g ? (g.state === "pre" ? esc(g.a.abbr + " at " + g.h.abbr + ", " + timeOf(g.start)) : esc(g.a.abbr + " " + g.a.score + ", " + g.h.abbr + " " + g.h.score + " · " + g.detail)) : (l.eid ? "loading…" : "not linked to a game");
  return { r: r, g: g, score: score };
}
function legLabel(l) {
  if (l.t === "prop") return (l.pl || "Player") + " " + (l.dir || "") + " " + (l.line == null ? "" : l.line) + " " + (l.s || "");
  if (l.t === "ml") return l.team + " ML";
  if (l.t === "under") return "Under " + l.line;
  if (l.t === "over") return "Over " + l.line;
  return l.team + " " + (l.line > 0 ? "+" : "") + l.line;
}
function betCard(b, i) {
  var prof = E.profit(b), win = b.s * (E.dec(b.o) - 1);
  var head = '<div class="row"><div><b>' + esc(b.l) + '</b><div class="mu">' + esc(b.sp || "") + " · " + esc(b.ty || "Single") + " · " + esc(sgn(b.o)) + " · stake " + money(b.s) + " · to win " + money(win) + "</div></div>" +
    (b.r === "open" ? '<span class="chip am">Open</span>' : '<span class="chip ' + (b.r === "win" ? "" : b.r === "loss" ? "ls" : "nt") + '">' + b.r.charAt(0).toUpperCase() + b.r.slice(1) + " " + (b.r === "void" ? "" : (prof >= 0 ? "+" : "") + money(prof)) + "</span>") + "</div>";
  var legs = "";
  if (b.lg && b.lg.length) {
    legs = '<div style="margin-top:6px">' + b.lg.map(function (l) {
      var s = legStatus(l), cl = s.r.s === "w" || s.r.lead > 0 ? "pos" : s.r.s === "l" || s.r.lead < 0 ? "neg" : "mu";
      return '<div class="leg"><span>' + esc(legLabel(l)) + '<div class="mu">' + s.score + '</div></span><span class="' + cl + '"><b>' + esc(s.r.txt) + "</b></span></div>";
    }).join("") + "</div>";
  }
  var acts = "";
  if (b.r === "open") {
    var auto = E.betAuto(b, function (l) { return X.index[String(l.eid)] || null; });
    var hasAuto = b.lg && b.lg.length && b.lg.every(function (l) { return l.t !== "prop"; });
    acts = '<div class="row" style="margin-top:8px"><span class="mu">' + (hasAuto ? (auto ? "Final scores say " + auto + "." : "Settles by itself when the games finish.") : "Mark the result when it is decided.") + "</span><span>" +
      (auto ? '<button class="btn sm" data-act="settle" data-id="' + b.id + '" data-v="' + auto + '">Mark ' + auto + "</button> " : "") +
      '<button class="btn sm alt" data-act="betmenu" data-id="' + b.id + '">Manage</button></span></div>';
  } else {
    acts = '<div class="row" style="margin-top:6px"><span class="mu">' + esc(b.n || "") + '</span><button class="btn sm alt" data-act="betmenu" data-id="' + b.id + '">Manage</button></div>';
  }
  return '<div class="card flat">' + head + legs + acts + "</div>";
}

/* ---------- Today ---------- */
function renderToday() {
  var d = today(), dayP = 0, rec = [0, 0], open = BETS.filter(function (b) { return b.r === "open"; });
  BETS.forEach(function (b) { if (b.d === d) dayP += E.profit(b); if (b.r === "win") rec[0]++; if (b.r === "loss") rec[1]++; });
  var g = E.guard(BETS, d, S), h = "";
  h += '<div class="card hero"><div class="mu">Bankroll</div><div class="big">' + money(bankroll()) + '</div><div class="kp"><div>Today<b class="' + cls(dayP) + '">' + uStr(dayP) + '</b></div><div>Open bets<b>' + open.length + '</b></div><div>Record<b>' + rec[0] + "-" + rec[1] + "</b></div></div></div>";
  if (g.hit) h += '<div class="alert">' + esc(g.msg) + " Stop for today.</div>";
  if (coolLeft()) h += '<div class="alert">Cool-off is on for ' + coolText() + ". Logging new bets is switched off.</div>";
  if (SLATE && SLATE.news && SLATE.news.length) h += '<div class="note">' + SLATE.news.map(esc).join("<br>") + "</div>";
  h += "<h2>Your open bets</h2>";
  h += open.length ? open.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }).map(betCard).join("") : '<div class="empty">No open bets. Log one from the Picks tab, or add your own in the Tracker.</div>';
  var best = PICKS.filter(function (p) { return p.d === d && p.state === "pre" && p.u > 0 && !placedFor(p); }).sort(function (a, b) { return b.u - a.u || b.ev - a.ev; }).slice(0, 3);
  h += '<h2>Best plays today <span class="n"><a href="#" data-act="tab" data-v="picks">All picks</a></span></h2>';
  h += best.length ? best.map(function (p) { return pickCard(p, { compact: true }); }).join("") : '<div class="empty">' + (PICKS.length ? "No plays clear my threshold right now. Passing is a position." : (SLATE ? "No picks posted for today yet." : "Picks load once the daily slate is available.")) + "</div>";
  var live = gamesList().filter(function (x) { return x.state === "in"; });
  live.sort(function (a, b) { return (STAR[b.id] ? 1 : 0) - (STAR[a.id] ? 1 : 0) || (betsForGame(b).length - betsForGame(a).length); });
  h += "<h2>Live now <span class=\"n\">" + live.length + " game" + (live.length === 1 ? "" : "s") + "</span></h2>";
  h += live.length ? '<div class="card">' + live.slice(0, 8).map(function (x) { return gameRow(x, { noOdds: false }); }).join("") + "</div>" : '<div class="empty">No games in progress.</div>';
  var settledToday = BETS.filter(function (b) { return b.d === d && E.settled(b); });
  h += "<h2>Day in review</h2>";
  h += '<div class="card flat">' + (BETS.some(function (b) { return b.d === d; }) ? '<div class="st3">' +
    [["Bets today", BETS.filter(function (b) { return b.d === d; }).length], ["Settled", settledToday.length], ["Net", uStr(dayP), cls(dayP)]].map(function (x) { return "<div>" + x[0] + '<b class="' + (x[2] || "") + '">' + x[1] + "</b></div>"; }).join("") + "</div>" : '<div class="mu">Nothing logged today.</div>') +
    '<div class="mu" style="margin-top:6px">' + esc(E.guard(BETS, d, S).n + " logged · limits: " + (S.betCap > 0 ? S.betCap + " bets" : "no bet cap") + ", " + (S.lossLimit > 0 ? money(S.lossLimit) + " loss" : "no loss cap")) + "</div></div>";
  $("t-today").innerHTML = h;
}

/* ---------- Picks ---------- */
function confText(p) {
  if (p.u >= 1.5) return "Strong"; if (p.u >= 1) return "Good"; if (p.u > 0) return "Small edge"; return "No edge at this price";
}
function pickCard(p, o) {
  o = o || {};
  var placed = placedFor(p), started = p.state !== "pre";
  var edge = p.pu - p.be;
  var sel = UI.sel[p.id] ? "checked" : "";
  var res = p.res && p.res.s ? '<span class="tag ' + (p.res.s === "w" ? "" : p.res.s === "l" ? "ls" : "nt") + '">' + (p.res.s === "w" ? "Won" : p.res.s === "l" ? "Lost" : "Push") + "</span>" : (started && p.g ? '<span class="tag am">' + (p.g.state === "in" ? "Live: " + esc(p.res ? p.res.txt : "") : esc(p.g.detail)) + "</span>" : "");
  var priceTxt = sgn(p.od) + " " + esc(p.src) + (p.live ? " (live)" : "");
  var h = '<div class="card ' + (o.compact ? "" : "") + '"><div class="pickrow">' +
    (!o.compact && !started && p.leg ? '<input class="cb" type="checkbox" data-act="sel" data-id="' + esc(p.id) + '" ' + sel + ' aria-label="Add to parlay">' : "") +
    '<div style="flex:1;min-width:0"><div class="pk-h"><div class="t">' + esc(p.label) + '</div><div class="pk-u ' + (p.u > 0 ? "" : "z") + '">' + (p.u > 0 ? uf(p.u) : "Pass") + "</div></div>" +
    '<div class="sub"><span>' + esc(p.sp) + "</span><span>" + esc(p.game) + "</span>" + (p.when ? "<span>" + esc(p.when) + "</span>" : "") + (p.type === "prop" ? "<span>Player prop</span>" : "") + "</div>" +
    '<div class="sub"><span>Price <b>' + priceTxt + "</b></span>" + (p.u > 0 ? "<span>Stake <b>" + money(p.stake) + "</b></span>" : "") + "<span>EV <b class=\"" + cls(p.ev) + '">' + (p.ev >= 0 ? "+" : "") + (p.ev * 100).toFixed(1) + "%</b></span></div>" +
    '<div class="conf"><i style="width:' + Math.min(100, Math.max(4, p.pu * 100)) + '%"></i></div>' +
    '<div class="sub"><span>Win chance <b>' + pct(p.pu, 0) + "</b> vs break-even <b>" + pct(p.be, 0) + "</b></span><span>" + confText(p) + "</span>" + (p.capped ? "<span>Held to 0.5u: model and market far apart</span>" : "") + (p.early ? "<span>Early-season NBA cap</span>" : "") + "</div>" +
    (res ? '<div class="sub">' + res + "</div>" : "") +
    (o.compact ? "" : '<details data-k="why-' + esc(p.id) + '" ' + (UI.open["why-" + p.id] ? "open" : "") + '><summary>Why this pick</summary><div class="mu" style="padding:6px 0">' + esc(p.why) + (p.pm != null ? " Market (no-vig) " + pct(p.pm, 1) + ", model " + pct(p.p, 1) + ", blended " + pct(p.pu, 1) + "." : "") + "</div></details>") +
    '<div class="row" style="margin-top:8px"><span>' + (placed ? '<span class="tag">Logged ✓</span>' : "") + "</span><span>" +
    '<button class="btn sm alt" data-act="share" data-id="' + esc(p.id) + '">Share</button> ' + (p.g ? '<button class="btn sm alt" data-act="game" data-id="' + esc(p.g.id) + '">Game</button> ' : "") +
    (started ? "" : (placed ? "" : '<button class="btn sm" data-act="log" data-id="' + esc(p.id) + '">Log it</button>')) + "</span></div></div></div></div>";
  return h;
}
function renderPicks() {
  var days = {}; PICKS.forEach(function (p) { if (p.d >= today()) days[p.d] = 1; });
  var dayList = Object.keys(days).sort();
  if (!UI.pickDay || (dayList.length && dayList.indexOf(UI.pickDay) < 0)) UI.pickDay = dayList[0] || today();
  var h = '<div class="card"><div class="row"><div><div class="mu">Bet sizing</div><div style="font-weight:600">1 unit = ' + money(S.unit) + ", scaled by edge (0.5u to " + S.ucap + 'u)</div></div><button class="btn sm alt" data-act="settings">Change</button></div></div>';
  var g = E.guard(BETS, today(), S);
  if (g.hit) h += '<div class="alert">' + esc(g.msg) + " Stop for today.</div>";
  if (dayList.length > 1) h += '<div class="seg" style="margin-bottom:8px">' + dayList.map(function (d) { return '<button class="' + (UI.pickDay === d ? "on" : "") + '" data-act="pday" data-v="' + d + '">' + dayLabel(d) + "</button>"; }).join("") + "</div>";
  var inDay = PICKS.filter(function (p) { return p.d === UI.pickDay; });
  var sports = SPORT_ORDER.filter(function (s) { return inDay.some(function (p) { return p.sp === s; }); });
  if (sports.length > 1) h += '<div class="seg" style="margin-bottom:8px"><button class="' + (UI.pfilter === "ALL" ? "on" : "") + '" data-act="pfilter" data-v="ALL">All</button>' + sports.map(function (s) { return '<button class="' + (UI.pfilter === s ? "on" : "") + '" data-act="pfilter" data-v="' + s + '">' + s + "</button>"; }).join("") + "</div>";
  var list = inDay.filter(function (p) { return UI.pfilter === "ALL" || p.sp === UI.pfilter; });
  var rec = list.filter(function (p) { return p.state === "pre" && p.u > 0; }).sort(function (a, b) { return b.u - a.u || b.ev - a.ev; });
  var pass = list.filter(function (p) { return p.state === "pre" && p.u === 0; }).sort(function (a, b) { return b.ev - a.ev; });
  var gone = list.filter(function (p) { return p.state !== "pre"; });
  h += '<div class="note">Win chances come from my model blended with the sportsbook price. They are estimates, not guarantees, and books price in most of what I can see. Check the price in your sportsbook before you bet, and only risk what you can afford to lose.</div>';
  h += "<h2>Recommended <span class=\"n\">" + rec.length + "</span></h2>";
  h += rec.length ? rec.map(function (p) { return pickCard(p); }).join("") : '<div class="empty">' + (PICKS.length ? "No recommended bets for this filter. Some games have no edge at the current price." : (SLATE ? "No picks posted yet." : "Waiting for the daily slate.")) + "</div>";
  if (pass.length) h += '<h2>Leans and passes <span class="n">' + pass.length + "</span></h2>" + '<div class="card flat"><details data-k="passes" ' + (UI.open.passes ? "open" : "") + '><summary>Show ' + pass.length + " games with no edge at this price</summary>" + pass.map(function (p) { return pickCard(p); }).join("") + "</details></div>";
  if (gone.length) h += "<h2>Started or finished <span class=\"n\">" + gone.length + "</span></h2>" + gone.map(function (p) { return pickCard(p); }).join("");
  h += '<div class="card flat mu">Gambling can be addictive. 21+ only (age varies by state). If it stops being fun, call 1-800-GAMBLER or visit ncpgambling.org.</div>';
  $("t-picks").innerHTML = h;
  renderSelBar();
}
function renderSelBar() {
  var n = Object.keys(UI.sel).filter(function (k) { return UI.sel[k]; }).length, b = $("selbar");
  if (UI.tab === "picks" && n >= 2) { b.hidden = false; b.innerHTML = '<button class="btn" data-act="parlay">Build parlay (' + n + " legs)</button>"; } else b.hidden = true;
}

/* ---------- Scores ---------- */
function renderScores() {
  var sp = UI.sp, day = UI.day, games = gamesList().filter(function (g) { return g.sp === sp && g.day === day; });
  var h = '<div class="seg" style="margin-top:12px">' + SPORT_ORDER.map(function (s) { return '<button class="' + (sp === s ? "on" : "") + '" data-act="sp" data-v="' + s + '">' + X.sport(s).name + "</button>"; }).join("") + "</div>";
  h += '<div class="row" style="margin:10px 0"><button class="btn sm alt" data-act="dayshift" data-v="-1" aria-label="Previous day">◀</button><div style="text-align:center"><b>' + dayLabel(day) + '</b><div class="mu" id="scupd">' + (UI.updated ? "Updated " + new Date(UI.updated).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "") + '</div></div><button class="btn sm alt" data-act="dayshift" data-v="1" aria-label="Next day">▶</button></div>';
  if (UI.loading) h += '<div class="mu">Loading…</div>';
  if (X.status.ok === false && !games.length) h += '<div class="alert">Could not reach the live score feed (' + esc(X.status.err) + "). Check your connection and pull to refresh.</div>";
  games.sort(function (a, b) {
    var o = { in: 0, pre: 1, post: 2, off: 3 };
    return (o[a.state] - o[b.state]) || (STAR[b.id] ? 1 : 0) - (STAR[a.id] ? 1 : 0) || a.start.localeCompare(b.start);
  });
  var sh = games.filter(function (g) { return STAR[g.id]; });
  if (!games.length && !UI.loading && X.status.ok !== false) h += '<div class="empty">No ' + X.sport(sp).name + " games on this day.</div>";
  else if (games.length) h += '<div class="card">' + games.map(function (g) { return gameRow(g); }).join("") + "</div>";
  h += '<div class="mu" style="text-align:center">Scores refresh about every 30 seconds while this screen is open. Odds are the sportsbook line from ESPN.</div>';
  $("t-scores").innerHTML = h;
}

/* ---------- Tracker ---------- */
function chartSvg(series, start) {
  if (series.length < 2) return '<div class="empty">The chart appears after your first settled bet.</div>';
  var W = 320, H = 130, pad = 22, vs = series.map(function (s) { return s.v; }), mn = Math.min.apply(null, vs.concat([start])), mx = Math.max.apply(null, vs.concat([start]));
  if (mx - mn < 1) { mx += 1; mn -= 1; }
  var x = function (i) { return pad + (W - pad - 6) * i / (series.length - 1); }, y = function (v) { return 8 + (H - 22) * (1 - (v - mn) / (mx - mn)); };
  var pts = series.map(function (s, i) { return x(i).toFixed(1) + "," + y(s.v).toFixed(1); }).join(" ");
  var last = series[series.length - 1].v;
  return '<svg class="ch" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Bankroll over settled bets"><line x1="' + pad + '" x2="' + (W - 6) + '" y1="' + y(start).toFixed(1) + '" y2="' + y(start).toFixed(1) + '" stroke="var(--line)" stroke-dasharray="4 3"/><polyline fill="none" stroke="' + (last >= start ? "var(--acc)" : "var(--loss)") + '" stroke-width="2.2" stroke-linejoin="round" points="' + pts + '"/>' +
    '<text x="2" y="' + (y(mx) + 4).toFixed(1) + '">' + Math.round(mx) + '</text><text x="2" y="' + (y(mn) + 4).toFixed(1) + '">' + Math.round(mn) + '</text><text x="' + (W - 6) + '" y="' + (H - 4) + '" text-anchor="end">' + (series.length - 1) + ' settled bets</text></svg>';
}
function breakdownTable(rows) {
  if (!rows.length) return '<div class="mu">Not enough settled bets yet.</div>';
  return '<div class="scroll-x"><table class="tbl"><tr><th></th><th>Bets</th><th>Record</th><th>Units</th><th>ROI</th></tr>' + rows.map(function (s) {
    return "<tr><td>" + esc(s.key) + "</td><td>" + s.n + "</td><td>" + s.w + "-" + s.l + (s.p ? "-" + s.p : "") + '</td><td class="' + cls(s.profit) + '">' + (s.units >= 0 ? "+" : "") + (Math.round(s.units * 100) / 100) + "</td><td class=\"" + cls(s.roi) + '">' + (s.roi * 100).toFixed(0) + "%</td></tr>";
  }).join("") + "</table></div>";
}
function renderTracker() {
  var all = E.summary(BETS, S.unit), h = "";
  h += '<div class="st3">' + [["Profit", money(all.profit), cls(all.profit)], ["Units", (all.units >= 0 ? "+" : "") + (Math.round(all.units * 100) / 100) + "u", cls(all.units)], ["ROI", (all.roi * 100).toFixed(1) + "%", cls(all.roi)], ["Record", all.w + "-" + all.l + (all.p ? "-" + all.p : "")], ["Open", all.open + " (" + money(all.openRisk) + ")"], ["Streak", E.streak(BETS) || "—"]].map(function (x) { return "<div>" + x[0] + '<b class="' + (x[2] || "") + '" style="font-size:' + (x[0] === "Streak" ? "14px" : "20px") + '">' + esc(x[1]) + "</b></div>"; }).join("") + "</div>";
  h += "<h2>Bankroll</h2><div class=\"card\">" + chartSvg(E.series(BETS, S.start), S.start) + "</div>";
  var filt = BETS.filter(function (b) {
    if (UI.tfilter === "open" && b.r !== "open") return false;
    if (UI.tfilter === "settled" && b.r === "open") return false;
    if (UI.tsp !== "ALL" && b.sp !== UI.tsp) return false;
    return true;
  }).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
  var spList = ["ALL"].concat(SPORT_ORDER.filter(function (s) { return BETS.some(function (b) { return b.sp === s; }); }));
  h += '<div class="row" style="margin:18px 0 8px"><h2 style="margin:0">Bets</h2><button class="btn sm" data-act="add">Add a bet</button></div>';
  h += '<div class="seg">' + [["all", "All"], ["open", "Open"], ["settled", "Settled"]].map(function (x) { return '<button class="' + (UI.tfilter === x[0] ? "on" : "") + '" data-act="tfilter" data-v="' + x[0] + '">' + x[1] + "</button>"; }).join("") + "</div>";
  if (spList.length > 2) h += '<div class="seg" style="margin-top:6px">' + spList.map(function (s) { return '<button class="' + (UI.tsp === s ? "on" : "") + '" data-act="tsp" data-v="' + s + '">' + (s === "ALL" ? "All sports" : s) + "</button>"; }).join("") + "</div>";
  h += filt.length ? filt.map(betCard).join("") : '<div class="empty">No bets here yet.</div>';
  var settled = BETS.filter(E.settled);
  h += "<h2>Where you win and lose</h2><div class=\"card\"><div class=\"mu\" style=\"margin-bottom:4px\"><b>By sport</b></div>" + breakdownTable(E.group(settled, function (b) { return b.sp || "Other"; }, S.unit)) +
    "<div class=\"mu\" style=\"margin:12px 0 4px\"><b>By bet type</b></div>" + breakdownTable(E.group(settled, function (b) { return b.ty || "Single"; }, S.unit)) +
    "<div class=\"mu\" style=\"margin:12px 0 4px\"><b>By price</b></div>" + breakdownTable(E.group(settled, function (b) { return E.oddsBucket(b.o); }, S.unit)) + "</div>";
  var mr = modelRecord();
  h += "<h2>Model scorecard</h2><div class=\"card\">";
  if (!mr.all.n) h += '<div class="mu">Every moneyline pick the model makes is logged here and graded when the game ends. Nothing graded yet.</div>';
  else {
    h += '<div class="st3"><div>Model picks<b>' + mr.all.w + "-" + mr.all.l + "</b></div><div>Win rate<b>" + pct(mr.all.w / mr.all.n, 0) + "</b></div><div>Expected<b>" + pct(mr.all.ps / mr.all.n, 0) + "</b></div></div>";
    h += '<div class="scroll-x"><table class="tbl"><tr><th>Sport</th><th>Record</th><th>Win %</th><th>Expected</th><th>Units (sized plays)</th></tr>' + Object.keys(mr.by).sort().map(function (k) {
      var x = mr.by[k]; return "<tr><td>" + k + "</td><td>" + x.w + "-" + x.l + "</td><td>" + pct(x.w / x.n, 0) + "</td><td>" + pct(x.ps / x.n, 0) + '</td><td class="' + cls(x.units) + '">' + (x.units >= 0 ? "+" : "") + (Math.round(x.units * 100) / 100) + "u</td></tr>";
    }).join("") + "</table></div><div class=\"mu\" style=\"margin-top:6px\">Expected is the model's average win chance. Small samples swing a lot, so give this a few weeks before trusting it.</div>";
  }
  h += "</div>";
  h += '<h2>Data</h2><div class="card flat"><div class="row"><button class="btn sm alt" data-act="export">Back up</button><button class="btn sm alt" data-act="csv">Export CSV</button><button class="btn sm alt" data-act="import">Restore / import</button></div><div class="mu" style="margin-top:8px">Your bets are saved on this device. Back up before switching phones.</div></div>';
  $("t-track").innerHTML = h;
}

/* ---------- Tools ---------- */
function renderTools() {
  var f = function (id, label, val, step) { return '<label class="f">' + label + '<input id="' + id + '" data-calc="1" type="number" step="' + (step || "any") + '" value="' + (val == null ? "" : val) + '" inputmode="decimal"></label>'; };
  var card = function (id, title, desc, inputs, extra) { return '<div class="card"><h3>' + title + '</h3><div class="mu" style="margin-bottom:8px">' + desc + '</div><div class="g2">' + inputs + '</div>' + (extra || "") + '<div id="out-' + id + '" style="margin-top:10px"></div></div>'; };
  var h = '<h2 style="margin-top:16px">Calculators</h2>';
  h += card("conv", "Odds converter", "Turn American odds into decimal and the win chance they imply.", f("cv_o", "American odds", -110));
  h += card("pay", "Payout", "What a bet returns.", f("py_o", "American odds", -110) + f("py_s", "Stake ($)", 10));
  h += card("par", "Parlay", "Combined price of several legs. Enter each leg's American odds separated by commas.", '<label class="f" style="grid-column:1/-1">Leg odds<input id="pr_l" data-calc="1" value="-110, +150, -135"></label>' + f("pr_s", "Stake ($)", 5) + f("pr_p", "Win chance per leg (%), optional", ""));
  h += card("nv", "Remove the vig", "Find the true chances behind two sides' prices.", f("nv_a", "Side A odds", -110) + f("nv_b", "Side B odds", -110));
  h += card("ev", "Expected value and bet size", "Compare your win chance to the price. Gives my unit size and Kelly stakes.", f("ev_o", "American odds", -110) + f("ev_p", "Your win chance (%)", 55) + f("ev_b", "Bankroll ($)", Math.round(bankroll())));
  h += card("hg", "Hedge", "Lock in profit by betting the other side.", f("hg_s", "Original stake ($)", 10) + f("hg_o", "Original odds", 400) + f("hg_h", "Other side's odds now", -150));
  h += card("bo", "Profit boost", "Is the boosted price worth it?", f("bo_o", "Odds before boost", 200) + f("bo_b", "Boost (%)", 30) + f("bo_p", "Your win chance (%)", 36));
  h += '<h2>Play it safe</h2><div class="card flat"><div class="mu">Set limits and take a break when you need one.</div><div style="margin-top:8px"><button class="btn sm alt" data-act="safe">Limits and cool-off</button></div></div>';
  $("t-tools").innerHTML = h;
  calcAll();
}
function calcAll() {
  var v = function (id) { var e = $(id); return e ? e.value : ""; }, n = function (id) { return parseFloat(v(id)); };
  var set = function (id, html) { var e = $("out-" + id); if (e) e.innerHTML = html; };
  var bad = '<div class="mu">Enter odds like -110 or +150.</div>', st = function (rows) { return '<div class="st2">' + rows.map(function (r) { return "<div>" + r[0] + '<b class="' + (r[2] || "") + '">' + r[1] + "</b></div>"; }).join("") + "</div>"; };
  var o = n("cv_o");
  set("conv", E.okOdds(o) ? st([["Decimal", E.dec(o).toFixed(3)], ["Implied chance", pct(E.impl(o))], ["Fractional", (E.dec(o) - 1).toFixed(2) + "/1"]]) : bad);
  o = n("py_o"); var s = n("py_s");
  set("pay", E.okOdds(o) && s > 0 ? st([["Profit if it wins", money(s * (E.dec(o) - 1))], ["Total return", money(s * E.dec(o))], ["Break-even", pct(E.impl(o))]]) : bad);
  var legs = v("pr_l").split(/[,\s]+/).map(parseFloat).filter(E.okOdds), ps = n("pr_s"), pp = n("pr_p") / 100;
  if (legs.length >= 2) {
    var pl = E.parlay(legs), rows = [["Combined odds", sgn(pl.am)], ["Implied chance", pct(1 / pl.dec)]];
    if (ps > 0) rows.push(["Profit if it wins", money(ps * (pl.dec - 1))]);
    if (pp > 0 && pp < 1) { var pw = Math.pow(pp, legs.length), ev = pw * pl.dec - 1; rows.push(["Your chance", pct(pw)], ["EV per $1", (ev >= 0 ? "+" : "") + (ev * 100).toFixed(1) + "%", cls(ev)]); }
    set("par", st(rows) + '<div class="mu">Same-game legs are not independent, so sportsbooks price them differently.</div>');
  } else set("par", '<div class="mu">Enter at least two leg prices.</div>');
  var a = n("nv_a"), b = n("nv_b");
  set("nv", E.okOdds(a) && E.okOdds(b) ? (function () { var x = E.noVig(a, b); return st([["Side A true chance", pct(x.a)], ["Side B true chance", pct(x.h)], ["Book's hold", pct(x.hold)]]); })() : bad);
  o = n("ev_o"); var p = n("ev_p") / 100, bk = n("ev_b");
  if (E.okOdds(o) && p > 0 && p < 1) {
    var evv = p * E.dec(o) - 1, u = E.units(evv, S, S.ucap), k = E.kelly(p, E.dec(o));
    set("ev", st([["EV per $1", (evv >= 0 ? "+" : "") + (evv * 100).toFixed(1) + "%", cls(evv)], ["Break-even", pct(E.impl(o))], ["My size", evv < S.t1 ? "Pass" : uf(u) + " (" + money(u * S.unit) + ")"], ["Quarter Kelly", bk > 0 ? money(bk * k / 4) : "—"], ["Full Kelly", bk > 0 ? money(bk * k) : "—"]]) + '<div class="mu">Full Kelly is aggressive and assumes your win chance is exactly right. Most bettors use a quarter or less.</div>');
  } else set("ev", '<div class="mu">Enter odds and a win chance between 1 and 99.</div>');
  var hs = n("hg_s"), ho = n("hg_o"), hh = n("hg_h");
  set("hg", hs > 0 && E.okOdds(ho) && E.okOdds(hh) ? (function () { var r = E.hedge(hs, ho, hh); return st([["Hedge stake", money(r.hedge)], ["Profit either way", money(r.profit), cls(r.profit)]]); })() : bad);
  var bo = n("bo_o"), bb = n("bo_b") / 100, bp = n("bo_p") / 100;
  if (E.okOdds(bo) && bb >= 0 && bp > 0 && bp < 1) {
    var d = 1 + (E.dec(bo) - 1) * (1 + bb), e2 = bp * d - 1;
    set("bo", st([["Boosted odds", sgn(E.am(d))], ["Break-even", pct(1 / d)], ["EV per $1", (e2 >= 0 ? "+" : "") + (e2 * 100).toFixed(1) + "%", cls(e2)], ["My size", e2 < S.t1 ? "Pass" : uf(E.units(e2, S, S.ucap))]]));
  } else set("bo", '<div class="mu">Enter odds, a boost and a win chance.</div>');
}

function renderAll() {
  renderNav();
  ["today", "picks", "scores", "track", "tools"].forEach(function (t) { $("t-" + t).hidden = UI.tab !== t; });
  $("selbar").hidden = true;
  if (UI.tab === "today") renderToday();
  else if (UI.tab === "picks") renderPicks();
  else if (UI.tab === "scores") renderScores();
  else if (UI.tab === "track") renderTracker();
  else if (UI.tab === "tools" && !$("t-tools").dataset.done) { renderTools(); $("t-tools").dataset.done = "1"; }
  var st = X.status;
  var chip = $("feedchip");
  if (st.ok === true) { chip.className = "chip"; chip.textContent = "Live"; }
  else if (st.ok === false) { chip.className = "chip ls"; chip.textContent = "Offline"; }
  else { chip.className = "chip nt"; chip.textContent = "Connecting"; }
  $("asof").textContent = SLATE && SLATE.asof ? "Picks updated " + new Date(SLATE.asof).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : "Waiting for today's picks";
}
