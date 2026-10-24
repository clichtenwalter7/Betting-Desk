# Betting Desk (app)

Static progressive web app. No build step, no server code. Everything a bettor needs in one place: daily picks, live scores and game details, bet tracking and settling, bankroll stats, calculators, and responsible-gambling limits.

## Put it online (free, ~5 minutes)
Any static host works. Easiest: **Netlify Drop** (app.netlify.com/drop, drag this whole folder in) or **Cloudflare Pages** or **GitHub Pages**. You get an https link to text to friends.

## Install on a phone
- iPhone: open the link in Safari, Share, Add to Home Screen.
- Android: open in Chrome, menu, Install app.

## Daily picks
The app reads `data/slate.json` (picks) and `data/nba.json` (win totals and last-season margins) every time it opens and every 10 minutes. Update those files each morning and every phone gets the new picks. Schema is in `data/slate.json` (picks, totals, props, nba.season, nba.games, news).
Live scores, odds and game details come straight from ESPN's public feed in the browser, and DraftKings prices are used when ESPN reports them.

## Data
Each person's bets live on their own phone (Tracker, Back up). Use Settings and Tracker to export or import.

## 21+ only. Problem gambling help: 1-800-GAMBLER, ncpgambling.org.
