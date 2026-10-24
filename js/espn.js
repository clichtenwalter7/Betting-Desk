/* ESPN public scoreboard feed: live scores, game state, DraftKings odds and game details. Browser (and Node, for tests). */
(function (root) {
  var X = {};
  var BASE = "https://site.api.espn.com/apis/site/v2/sports/";
  X.SPORTS = [
    { k: "NFL", path: "football/nfl", name: "NFL", q: "" },
    { k: "CFB", path: "football/college-football", name: "College FB", q: "&groups=80" },
    { k: "NBA", path: "basketball/nba", name: "NBA", q: "" },
    { k: "NHL", path: "hockey/nhl", name: "NHL", q: "" },
    { k: "MLB", path: "baseball/mlb", name: "MLB", q: "" },
    { k: "NCAAB", path: "basketball/mens-college-basketball", name: "College BB", q: "&groups=50" }
  ];
  X.sport = function (k) { return X.SPORTS.filter(function (s) { return s.k === k; })[0]; };
  X.status = { ok: null, err: "", at: 0 };
  X.fetchImpl = null;   /* tests replace this */

  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : null; };
  var amer = function (v) {
    if (v == null) return null;
    var s = String(v).trim().toUpperCase();
    if (s === "EVEN" || s === "EV" || s === "PK") return 100;
    var n = parseFloat(s.replace(/^[OU]/, ""));
    return isFinite(n) && Math.abs(n) >= 100 ? n : null;
  };
  var lineNum = function (v) { if (v == null) return null; var n = parseFloat(String(v).replace(/^[OoUu]/, "")); return isFinite(n) ? n : null; };
  X._amer = amer;

  function normOdds(comp) {
    var arr = comp.odds || [], o = arr[0];
    if (!o) return null;
    var out = { src: (o.provider && o.provider.name) || "DraftKings", details: o.details || "" };
    var ml = o.moneyline || {};
    out.mlH = amer(ml.home && ml.home.close && ml.home.close.odds);
    out.mlA = amer(ml.away && ml.away.close && ml.away.close.odds);
    out.mlHo = amer(ml.home && ml.home.open && ml.home.open.odds);
    out.mlAo = amer(ml.away && ml.away.open && ml.away.open.odds);
    if (out.mlH == null && o.homeTeamOdds) out.mlH = amer(o.homeTeamOdds.moneyLine);
    if (out.mlA == null && o.awayTeamOdds) out.mlA = amer(o.awayTeamOdds.moneyLine);
    var ps = o.pointSpread || {};
    out.spreadH = lineNum(ps.home && ps.home.close && ps.home.close.line);
    out.spreadHOdds = amer(ps.home && ps.home.close && ps.home.close.odds);
    out.spreadAOdds = amer(ps.away && ps.away.close && ps.away.close.odds);
    out.spreadHo = lineNum(ps.home && ps.home.open && ps.home.open.line);
    if (out.spreadH == null && o.spread != null) out.spreadH = num(o.spread);
    var tot = o.total || {};
    out.total = lineNum(tot.over && tot.over.close && tot.over.close.line);
    if (out.total == null) out.total = num(o.overUnder);
    out.totalo = lineNum(tot.over && tot.over.open && tot.over.open.line);
    out.overOdds = amer(tot.over && tot.over.close && tot.over.close.odds);
    out.underOdds = amer(tot.under && tot.under.close && tot.under.close.odds);
    return out;
  }
  function normTeam(c) {
    var t = c.team || {};
    var rec = (c.records || []).filter(function (r) { return r.type === "total" || r.name === "overall"; })[0] || (c.records || [])[0];
    var rk = c.curatedRank && c.curatedRank.current;
    return {
      id: t.id, name: t.displayName || t.name || "", nick: t.name || t.shortDisplayName || "", short: t.shortDisplayName || t.name || "",
      abbr: t.abbreviation || "", logo: t.logo || (t.logos && t.logos[0] && t.logos[0].href) || "",
      score: num(c.score) == null ? 0 : num(c.score), rec: rec ? rec.summary : "", rank: rk && rk < 99 ? rk : null,
      lines: (c.linescores || []).map(function (l) { return l.displayValue != null ? l.displayValue : l.value; }),
      winner: c.winner === true
    };
  }
  X.normEvent = function (ev, spk) {
    var comp = (ev.competitions || [])[0]; if (!comp) return null;
    var cs = comp.competitors || [];
    var home = cs.filter(function (c) { return c.homeAway === "home"; })[0], away = cs.filter(function (c) { return c.homeAway === "away"; })[0];
    if (!home || !away) return null;
    var st = (ev.status || comp.status || {}), ty = st.type || {};
    var state = ty.state === "in" ? "in" : ty.state === "post" ? "post" : "pre";
    if (ty.name === "STATUS_POSTPONED" || ty.name === "STATUS_CANCELED") state = "off";
    var when = new Date(ev.date);
    var game = {
      id: String(ev.id), sp: spk, start: ev.date, day: isNaN(when) ? "" : when.toLocaleDateString("en-CA"),
      a: normTeam(away), h: normTeam(home), state: state, name: ev.name || "", short: ev.shortName || "",
      detail: ty.shortDetail || ty.detail || "", long: ty.detail || "", clock: st.displayClock || "", period: st.period || 0,
      odds: normOdds(comp), venue: (comp.venue && comp.venue.fullName) || "",
      bcast: ((comp.broadcasts || [])[0] && (comp.broadcasts[0].names || [])[0]) || "",
      note: ((comp.notes || [])[0] && comp.notes[0].headline) || "", fetched: Date.now()
    };
    if (state === "pre") { game.a.score = 0; game.h.score = 0; }
    return game;
  };

  /* ---------- fetching ---------- */
  function getJson(url, ms) {
    var f = X.fetchImpl || (typeof fetch !== "undefined" ? fetch.bind(root) : null);
    if (!f) return Promise.reject(new Error("no fetch"));
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null, tm = null;
    if (ctl) tm = setTimeout(function () { ctl.abort(); }, ms || 12000);
    return f(url, ctl ? { signal: ctl.signal } : undefined).then(function (r) {
      if (tm) clearTimeout(tm);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (j) { X.status = { ok: true, err: "", at: Date.now() }; return j; }, function (e) {
      if (tm) clearTimeout(tm);
      X.status = { ok: false, err: String(e && e.message || e), at: Date.now() };
      throw e;
    });
  }
  X._getJson = getJson;
  var ymd = function (s) { return s.replace(/-/g, ""); };
  var addDay = function (s, n) { var d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return d.toLocaleDateString("en-CA"); };
  X.addDay = addDay;

  X.index = {};          /* id -> game */
  var dayCache = {};     /* sp|day -> {t, ids} */
  var FIN_KEY = "bd2:fin";
  function loadFin() {
    try { var f = JSON.parse(localStorage.getItem(FIN_KEY) || "{}"); for (var id in f) if (!X.index[id]) X.index[id] = f[id]; } catch (e) { }
  }
  function saveFin() {
    try {
      var out = {}, ids = Object.keys(X.index).filter(function (i) { return X.index[i].state === "post"; });
      ids.sort(function (a, b) { return (X.index[b].start || "").localeCompare(X.index[a].start || ""); });
      ids.slice(0, 500).forEach(function (i) { out[i] = X.index[i]; });
      localStorage.setItem(FIN_KEY, JSON.stringify(out));
    } catch (e) { }
  }
  X.loadFin = loadFin;

  function fetchBoard(sp, etDay) {
    var s = X.sport(sp);
    return getJson(BASE + s.path + "/scoreboard?dates=" + ymd(etDay) + "&limit=300" + s.q).then(function (j) {
      return (j.events || []).map(function (e) { return X.normEvent(e, sp); }).filter(Boolean);
    });
  }
  /* games whose local start date is `day` (YYYY-MM-DD); asks for that date and the next one because US evening games roll into the next date */
  X.loadDay = function (sp, day, opts) {
    opts = opts || {};
    var key = sp + "|" + day, c = dayCache[key], now = Date.now();
    var anyLive = c && c.ids.some(function (i) { return X.index[i] && X.index[i].state !== "post"; });
    var ttl = opts.ttl != null ? opts.ttl : (c && !anyLive ? 600000 : 25000);
    if (c && !opts.force && now - c.t < ttl) return Promise.resolve(c.ids.map(function (i) { return X.index[i]; }));
    return Promise.all([fetchBoard(sp, day), fetchBoard(sp, addDay(day, 1)).catch(function () { return []; })]).then(function (r) {
      var all = r[0].concat(r[1]), seen = {}, ids = [];
      all.forEach(function (g) {
        var old = X.index[g.id];
        if (old && old.state === "post" && g.state !== "post") return;   /* never move a final game backwards */
        X.index[g.id] = g;
      });
      all.forEach(function (g) { if (g.day === day && !seen[g.id]) { seen[g.id] = 1; ids.push(g.id); } });
      dayCache[key] = { t: Date.now(), ids: ids };
      saveFin();
      return ids.map(function (i) { return X.index[i]; });
    }, function (e) {
      if (c) return c.ids.map(function (i) { return X.index[i]; });
      throw e;
    });
  };

  /* find the game for a bet leg: by event id, else by teams and the bet's date */
  X.gameFor = function (leg) { return leg.eid ? X.index[String(leg.eid)] || null : null; };
  X.resolveLeg = function (leg, bet) {
    if (leg.eid && X.index[String(leg.eid)]) return Promise.resolve(X.index[String(leg.eid)]);
    var sp = leg.sp || bet.sp, names = leg.k ? leg.k.split(" at ") : null;
    if (!sp || !X.sport(sp) || !bet.d) return Promise.resolve(null);
    return X.loadDay(sp, bet.d, { ttl: 600000 }).then(function (gs) {
      var E = root.E || require("./engine.js"), g = null;
      gs.forEach(function (x) {
        if (leg.eid && x.id === String(leg.eid)) g = x;
        else if (!leg.eid && names && E.sameTeam(names[0], x.a) && E.sameTeam(names[1], x.h)) g = x;
        else if (!leg.eid && !names && leg.team && (E.sameTeam(leg.team, x.a) || E.sameTeam(leg.team, x.h)) && !g) g = x;
      });
      if (g) leg.eid = g.id;
      return g;
    }).catch(function () { return null; });
  };

  /* ---------- game details ---------- */
  X.normSummary = function (j) {
    var out = { lines: null, teamStats: [], leaders: [], plays: [], injuries: [], players: [], winprob: null, odds: null, series: "", notes: [] };
    var comp = j.header && j.header.competitions && j.header.competitions[0];
    if (comp && comp.competitors) {
      out.lines = {};
      comp.competitors.forEach(function (c) { out.lines[c.homeAway] = (c.linescores || []).map(function (l) { return l.displayValue != null ? l.displayValue : l.value; }); });
    }
    var teams = (j.boxscore && j.boxscore.teams) || [], byHA = {};
    teams.forEach(function (t) { byHA[t.homeAway] = t; });
    if (byHA.away && byHA.home) {
      var hm = {}; (byHA.home.statistics || []).forEach(function (s) { hm[s.label || s.name] = s.displayValue; });
      (byHA.away.statistics || []).forEach(function (s) {
        var k = s.label || s.name; if (k && hm[k] != null) out.teamStats.push({ label: k, a: s.displayValue, h: hm[k] });
      });
    }
    ((j.boxscore && j.boxscore.players) || []).forEach(function (tp) {
      var team = tp.team && (tp.team.abbreviation || tp.team.displayName);
      (tp.statistics || []).slice(0, 4).forEach(function (cat) {
        var labels = cat.labels || cat.names || [];
        out.players.push({
          team: team, cat: cat.name || cat.type || "", labels: labels,
          rows: (cat.athletes || []).slice(0, 6).map(function (a) { return { n: a.athlete && a.athlete.displayName, s: a.stats || [] }; })
        });
      });
    });
    (j.leaders || []).forEach(function (tl) {
      var team = tl.team && (tl.team.abbreviation || tl.team.displayName);
      (tl.leaders || []).forEach(function (cat) {
        var top = (cat.leaders || [])[0]; if (!top) return;
        out.leaders.push({ team: team, cat: cat.displayName || cat.name, who: top.athlete && top.athlete.displayName, val: top.displayValue });
      });
    });
    (j.goalies && [j.goalies.awayTeam, j.goalies.homeTeam] || []).forEach(function (g) {
      if (g && g.athlete) out.notes.push("Goalie: " + (g.athlete.displayName || ""));
    });
    (j.scoringPlays || []).forEach(function (p) {
      out.plays.push({ text: p.text || (p.type && p.type.text) || "", period: p.period && (p.period.displayValue || p.period.number), clock: p.clock && p.clock.displayValue, a: p.awayScore, h: p.homeScore });
    });
    (j.injuries || []).forEach(function (ti) {
      var team = ti.team && (ti.team.abbreviation || ti.team.displayName);
      (ti.injuries || []).slice(0, 8).forEach(function (i) {
        out.injuries.push({ team: team, who: i.athlete && i.athlete.displayName, pos: i.athlete && i.athlete.position && i.athlete.position.abbreviation, status: i.status, detail: (i.details && (i.details.type || i.details.detail)) || "" });
      });
    });
    var wp = j.winprobability; if (wp && wp.length) out.winprob = wp[wp.length - 1].homeWinPercentage;
    var pc = (j.pickcenter || [])[0]; if (pc) out.odds = { provider: pc.provider && pc.provider.name, details: pc.details, ou: pc.overUnder };
    if (j.seasonseries && j.seasonseries[0]) out.series = j.seasonseries[0].summary || j.seasonseries[0].description || "";
    return out;
  };
  X.loadDetail = function (sp, id) {
    var s = X.sport(sp);
    return getJson(BASE + s.path + "/summary?event=" + encodeURIComponent(id), 15000).then(X.normSummary);
  };
  X.test = function () {
    var s = X.sport("NHL"), day = new Date().toLocaleDateString("en-CA"), res = [];
    var urls = [["Scoreboard", BASE + s.path + "/scoreboard?dates=" + ymd(day) + "&limit=5"]];
    return Promise.all(urls.map(function (u) {
      return getJson(u[1], 10000).then(function (j) { return u[0] + ": OK (" + ((j.events || []).length) + " games)"; }, function (e) { return u[0] + ": FAILED (" + (e.message || e) + ")"; });
    }));
  };

  if (typeof module !== "undefined" && module.exports) module.exports = X; else root.X = X;
})(typeof window !== "undefined" ? window : this);
