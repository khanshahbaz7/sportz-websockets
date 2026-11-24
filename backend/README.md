# Sportz API

Express + PostgreSQL + WebSocket sports dashboard API.

## Setup

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

The server listens on `PORT` (default `8000`) and exposes WebSockets at `/ws`.

## SportScore integration

Live football and cricket data is polled from SportScore and merged into the
`matches` table. The poller starts with the server and can be disabled with
`SPORTSCORE_POLL_ENABLED=false`.

### How matching works

- **Linked-only by default.** A match is synced only when its
  `external_source`/`external_id` or `external_source`/`external_slug` values
  match a SportScore fixture.
- **Optional auto-import.** Set `SPORTSCORE_AUTO_IMPORT=true` to create matches
  for nearby live or scheduled fixtures.
- Football is discovered per competition (see `SPORTSCORE_COMPETITIONS`).
  Cricket uses the global fixtures feed because the daily slate fits under the
  feed limit.
- Football detail data (incidents, stats, lineups, live minute) is fetched for
  live matches. Cricket is fixture-level only: SportScore does not expose live
  cricket detail for these endpoints.

### Link existing matches

```bash
# Auto-match unlinked rows by normalized team names for each match's date
npm run matches:link

# Preview without writing
npm run matches:link -- --dry-run

# Manually link one row
npm run matches:link -- --id=42 --slug=brentford-vs-everton
```

### One-off sync

```bash
npm run sync:once
npm run sync:once -- --sport=football --competition=english-premier-league
npm run sync:once -- --date=2026-11-23
```

### Endpoints

- `GET /matches` — list matches, including external/provider display fields.
- `GET /matches/:id` — fetch one match.
- `POST /matches` — create a match; accepts optional external link fields.
- `PATCH /matches/:id/external` — link a match to a provider fixture.
- `GET /matches/:id/commentary` — list commentary.
- `POST /matches/:id/commentary` — add commentary.

### WebSocket messages

Existing messages are unchanged:

- `match_created` — a new match was created.
- `commentary` — commentary was added for a subscribed match.

New message:

- `match_updated` — sent to subscribers of a match when synced fields change.
  The payload contains `data`, `changes` (field names), and `source`.

Subscribe with:

```json
{ "type": "subscribe", "matchId": 42 }
```

### Attribution

SportScore data must be attributed on any surface that renders it. API and
WebSocket payloads include an `attribution` object:

```json
{
  "provider": "SportScore",
  "text": "Powered by SportScore",
  "url": "https://sportscore.com",
  "follow": true
}
```

Render this as a visible dofollow link to `https://sportscore.com`.

## Tests

```bash
npm test
```
