/**
 * Single point of contact with IndianAPI (stock.indianapi.in).
 * Nothing else in this codebase should call fetch() against IndianAPI directly -
 * that keeps auth, base URL, timeout, and retry policy in exactly one place.
 *
 * Confirmed against real API responses (Sept 2026, Free/Hobby plan):
 *   - Base URL: https://stock.indianapi.in
 *   - Auth header: X-Api-Key
 *   - GET /stock?name=<company name or ticker>
 *   - GET /historical_data?stock_name=<ticker>&period=<1m|6m|1yr|3yr|5yr|10yr|max>&filter=price
 */

const BASE_URL = 'https://stock.indianapi.in';
const TIMEOUT_MS = Number(process.env.INDIANAPI_TIMEOUT_MS) || 10000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 300;

class IndianApiError extends Error {
  constructor(message, { status = null, code = 'UPSTREAM_ERROR', cause = null } = {}) {
    super(message);
    this.name = 'IndianApiError';
    this.status = status; // HTTP status from IndianAPI, if we got one
    this.code = code; // our own classification, see below
    this.cause = cause;
  }
}

/**
 * Minimal request queue enforcing the plan's 1 request/second cap.
 * Every call to IndianAPI (including retries) goes through this, so concurrent
 * lookups from our own app can never collectively exceed the limit.
 */
let lastRequestTime = 0;
const MIN_INTERVAL_MS = 1050; // slightly over 1s for safety margin

async function throttle() {
  const now = Date.now();
  const wait = lastRequestTime + MIN_INTERVAL_MS - now;
  if (wait > 0) {
    await sleep(wait);
  }
  lastRequestTime = Date.now();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithRetry(path, params, attempt = 0) {
  await throttle();

  const apiKey = process.env.INDIANAPI_KEY;
  if (!apiKey) {
    // Fail fast and loud rather than silently sending an unauthenticated request.
    throw new IndianApiError('INDIANAPI_KEY is not set in the environment', {
      code: 'MISSING_API_KEY',
    });
  }

  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { 'X-Api-Key': apiKey },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err.name === 'AbortError';
    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_BASE_DELAY_MS * Math.pow(3, attempt));
      return requestWithRetry(path, params, attempt + 1);
    }
    throw new IndianApiError(isTimeout ? 'IndianAPI request timed out' : 'Network error calling IndianAPI', {
      code: isTimeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_NETWORK_ERROR',
      cause: err,
    });
  }
  clearTimeout(timeoutId);

  // Retry on 5xx and 429 (rate limited) - never on 4xx client errors like a bad ticker.
  if ((response.status >= 500 || response.status === 429) && attempt < MAX_RETRIES) {
    await sleep(RETRY_BASE_DELAY_MS * Math.pow(3, attempt));
    return requestWithRetry(path, params, attempt + 1);
  }

  if (response.status === 401 || response.status === 403) {
    throw new IndianApiError('IndianAPI rejected the API key', {
      status: response.status,
      code: 'INVALID_API_KEY',
    });
  }

  if (response.status >= 400 && response.status < 500) {
    // Any remaining 4xx here (400, 404, 422, etc.) on a request we've already
    // format-validated almost always means IndianAPI didn't recognize the
    // ticker/company name - classify as "not found," not a generic failure.
    throw new IndianApiError(`IndianAPI returned ${response.status} for this ticker`, {
      status: response.status,
      code: 'NOT_FOUND',
    });
  }

  if (!response.ok) {
    throw new IndianApiError(`IndianAPI returned status ${response.status}`, {
      status: response.status,
      code: 'UPSTREAM_ERROR',
    });
  }

  let body;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    // Defensive: never trust the third-party's shape blindly. If it's not JSON,
    // something upstream is wrong (e.g. we hit the marketing site's 404 page).
    throw new IndianApiError('IndianAPI did not return JSON (unexpected content-type)', {
      code: 'UNEXPECTED_RESPONSE_SHAPE',
    });
  }

  try {
    body = await response.json();
  } catch (err) {
    throw new IndianApiError('Failed to parse IndianAPI response as JSON', {
      code: 'UNEXPECTED_RESPONSE_SHAPE',
      cause: err,
    });
  }

  return body;
}

/**
 * GET /stock?name=<query>
 * Returns the raw parsed JSON body. Parsing into our own shape happens in
 * stockService.js, not here - this module's only job is talking to IndianAPI.
 */
export async function fetchStockData(tickerOrName) {
  return requestWithRetry('/stock', { name: tickerOrName });
}

/**
 * GET /historical_data?stock_name=<ticker>&period=<period>&filter=price
 */
export async function fetchHistoricalData(ticker, period = '5yr') {
  return requestWithRetry('/historical_data', {
    stock_name: ticker,
    period,
    filter: 'price',
  });
}

export { IndianApiError };
