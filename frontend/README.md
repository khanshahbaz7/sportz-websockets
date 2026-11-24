# Sportz Live Deck

React + Vite frontend for the Sportz API. A live sports board with sport tabs,
trackable matches, and a match centre that streams commentary over WebSockets.

## Features

- **Sport tabs** for All, Football, Cricket, and any other sport the API returns.
  Counts and tabs are derived from real match data and sport names are normalised
  (for example `Cricket` and `cricket` share one tab).
- **Match board** with live status, minute, score text, cricket wickets, competition,
  kickoff countdowns, and a search box for teams or competitions.
- **Track matches** to add them to the match centre. Tracked match ids are stored in
  `localStorage`, so the watchlist survives reloads.
- **Live match centre** with the focused match's commentary. It reconnects
  automatically with backoff and re-subscribes after a reconnect.
- **Real-time updates** from the API's WebSocket:
  `match_created`, `match_updated`, and `commentary`.
- **SportScore attribution**: every card, the match centre, and the site footer
  render a visible dofollow “Powered by SportScore” link.

## Setup

The backend must be running first (see `../backend/README.md`).

```bash
npm install
cp .env.example .env
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

Vite proxies `/matches` and `/ws` to the backend. The default target is
`http://localhost:8000`; override it with `VITE_BACKEND_URL` in `.env`.

For a deployed API, set `VITE_API_BASE` and `VITE_WS_URL` instead of using the
dev proxy.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server with the API proxy. |
| `npm run build` | Production build in `dist/`. |
| `npm run lint` | Run Oxlint. |
| `npm run preview` | Preview the production build. |

## API usage

| Endpoint | Purpose |
| --- | --- |
| `GET /matches?limit=100` | Board data. |
| `GET /matches/:id/commentary?limit=60` | Initial commentary for a tracked match. |
| `WS /ws` | Subscribe/unsubscribe per match and receive live updates. |

WebSocket messages sent by the client:

```json
{ "type": "subscribe", "matchId": 12 }
{ "type": "unsubscribe", "matchId": 12 }
```

Messages received: `welcome`, `subscribed`, `unsubscribed`, `match_created`,
`match_updated`, and `commentary`.

## Structure

```
src/
  components/   Icons, match card, match centre, sport tabs
  hooks/        useMatchFeed: REST polling, WebSocket, subscriptions, commentary cache
  lib/          API client and formatting helpers
  App.jsx       Page shell, filtering, search, responsive watchlist drawer
  App.css       Component styles
  index.css     Design tokens, reset, ambient background
```
