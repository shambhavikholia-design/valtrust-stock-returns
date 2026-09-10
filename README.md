# Valtrust Stock Returns Calculator

A web app to look up an NSE-listed stock's current price and its returns across
1D through 5Y, including 3Y/5Y CAGR. Built for the Valtrust case study.

## Live demo

Not yet deployed — see "What's left to do" below.

## Tech stack

- **Backend:** Node.js + Express (plain JS, ES modules). Chosen for a small,
  fast-to-review codebase with no build step — appropriate for a single-endpoint
  API with one external dependency.
- **Frontend:** Vanilla HTML/CSS/JS, served as static files by the same Express
  server. No framework was needed for a single search box + single result view,
  and it keeps the whole app deployable as one unit (no separate frontend/backend
  hosting, no CORS to configure between them in production).
- **Data source:** [IndianAPI](https://indianapi.in) (`stock.indianapi.in`),
  Free/Hobby plan.
- **Testing:** Node's built-in test runner (`node --test`) — no extra
  dependency needed for this scope.

## How to run locally

```bash
cd server
cp .env.example .env
# edit .env and set INDIANAPI_KEY to your real key
npm install
npm start
```

Then open **http://localhost:4000** — the frontend and API are served from the
same origin, so there's nothing separate to start.

Run the test suite (no API key required, since these are pure unit tests):

```bash
cd server
npm test
```

## Architecture

```
client/                  Static frontend (HTML/CSS/JS)
server/
  src/
    calculations/         Pure functions: return %, CAGR, nearest-prior-trading-day
                           matching. No I/O - fully unit tested in isolation.
    indianapi/client.js    Single module owning ALL communication with IndianAPI:
                           base URL, auth header, timeout, retry-with-backoff,
                           and the 1 req/sec throttle for the whole app.
    cache/                In-memory TTL cache (10 min default) per ticker, to
                           respect the 5,000 req/month plan limit.
    services/              Orchestrates client + cache + calculations, and
                           defensively parses IndianAPI's response shapes.
    middleware/            Input validation + one centralized error-response
                           shape for the whole API.
    routes/                Thin HTTP layer only.
  tests/                  Unit tests targeting the highest-risk logic.
```

Request flow: `client -> GET /api/returns/:ticker -> validate -> cache check ->
IndianAPI client (stock + historical_data) -> parse -> compute periods ->
cache -> respond`.

## Confirmed API details (from real Postman testing against a live key)

- Base URL: `https://stock.indianapi.in` (not `indianapi.in`, which is just the
  marketing site and 404s).
- Auth header: `X-Api-Key`.
- `GET /stock?name=<query>` — `currentPrice.NSE` / `currentPrice.BSE` are
  returned as **strings**, parsed with `parseFloat`.
- `GET /historical_data?stock_name=<ticker>&period=5yr&filter=price` — returns
  a `datasets` array; the entry with `metric === "Price"` holds a `values`
  array of `[dateString, priceString]` pairs. Only trading days are included
  (weekends/holidays are already absent), which simplifies the nearest-prior-day
  matching since every entry is already a valid trading day.

## Assumptions made

- "Current price" is IndianAPI's `currentPrice.NSE` field, falling back to
  `currentPrice.BSE` if NSE is unavailable for a given stock.
- A single `period=5yr` historical fetch is used to cover all 8 return periods
  (sliced locally by date) rather than making 8 separate calls per lookup, to
  stay well within the 1 req/sec and 5,000/month limits.
- "Nearest prior trading day" (not nearest in either direction) is used to
  resolve weekend/holiday reference dates, since IndianAPI's historical series
  only contains trading days already.
- If a stock's listing history doesn't reach far enough back for a given period
  (or the nearest match falls outside a 10-day lookback window), that period is
  marked `insufficient_history` rather than guessing.

## Known limitations / what I'd do with more time

- **BSE ticker support** (the assignment's stretch goal) is partially there —
  BSE price is used as a fallback for current price, but historical BSE-only
  lookups aren't implemented.
- **No automated CI** wired up yet (e.g. GitHub Actions running `npm test` on
  push) — would add this next for a stronger, verifiable-on-every-commit signal.
- **Cache is in-memory and single-instance** — fine for this assignment's scale,
  but would move to Redis for any real multi-instance deployment.
- **No BSE data validated live** — only NSE tickers (RELIANCE) were tested
  against the real API before submission; other tickers and BSE-only stocks
  should be spot-checked before relying on this in production.

## AI tools used

- **Claude (Anthropic):** Planned the overall architecture and layered backend
  structure; wrote the calculation logic (return/CAGR formulas, nearest-prior-
  trading-day matching) and its unit tests; wrote the IndianAPI client with
  retry/backoff and the 1 req/sec throttle; wrote the frontend HTML/CSS/JS;
  helped debug the initial wrong-base-URL issue (`indianapi.in` vs
  `stock.indianapi.in`) by cross-referencing real Postman responses against the
  assumed shapes; wrote this README.
