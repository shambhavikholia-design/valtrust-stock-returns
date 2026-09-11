import { fetchStockData, fetchHistoricalData, IndianApiError } from '../indianapi/client.js';
import { getCached, setCached } from '../cache/memoryCache.js';
import { computeAllPeriods } from '../calculations/periods.js';

export class StockNotFoundError extends Error {
  constructor(ticker) {
    super(`Ticker "${ticker}" was not recognized by the data provider.`);
    this.name = 'StockNotFoundError';
  }
}

export class UpstreamUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UpstreamUnavailableError';
  }
}

/**
 * Defensively parse the /stock response. IndianAPI's shape is not something we
 * control, so every field access here is guarded rather than assumed.
 */
function parseStockResponse(raw, requestedTicker) {
  if (!raw || typeof raw !== 'object') {
    throw new UpstreamUnavailableError('Unexpected /stock response shape from IndianAPI');
  }

  const companyName = typeof raw.companyName === 'string' ? raw.companyName : requestedTicker;

  const nseTicker =
    raw?.companyProfile?.exchangeCodeNse && typeof raw.companyProfile.exchangeCodeNse === 'string'
      ? raw.companyProfile.exchangeCodeNse
      : requestedTicker.toUpperCase();

  const rawPrice = raw?.currentPrice;
  const nsePrice = parseFloat(rawPrice?.NSE);
  const bsePrice = parseFloat(rawPrice?.BSE);

  // Prefer NSE (assignment's minimum requirement is NSE support); fall back to BSE.
  const latestPrice = Number.isFinite(nsePrice) ? nsePrice : bsePrice;

  if (!Number.isFinite(latestPrice)) {
    // A 200 OK with no usable price almost always means the ticker/company
    // name wasn't recognized, not that the provider itself is down.
    throw new StockNotFoundError(requestedTicker);
  }

  return {
    ticker: nseTicker,
    companyName,
    currentPrice: latestPrice,
    pricesByExchange: {
      NSE: Number.isFinite(nsePrice) ? nsePrice : null,
      BSE: Number.isFinite(bsePrice) ? bsePrice : null,
    },
  };
}

/**
 * Defensively parse the /historical_data response into a plain ascending
 * [dateString, priceNumber-as-string] series, extracting only the "Price" dataset.
 */
function parseHistoricalResponse(raw) {
  if (!raw || !Array.isArray(raw.datasets)) {
    throw new UpstreamUnavailableError('Unexpected /historical_data response shape from IndianAPI');
  }

  const priceDataset = raw.datasets.find((d) => d && d.metric === 'Price');
  if (!priceDataset || !Array.isArray(priceDataset.values)) {
    throw new UpstreamUnavailableError('No Price dataset found in /historical_data response');
  }

  // Values arrive as [dateString, priceString] (Volume has a 3rd element we ignore).
  // Filter out anything malformed rather than letting one bad row break everything.
  const series = priceDataset.values
    .filter((entry) => Array.isArray(entry) && entry.length >= 2)
    .map(([date, price]) => [date, price])
    .filter(([date, price]) => typeof date === 'string' && !Number.isNaN(parseFloat(price)));

  // Ensure ascending order by date - don't assume the API always returns it sorted.
  series.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  return series;
}

/**
 * Main entry point used by the route. Handles caching, fetch orchestration,
 * and translates IndianAPI-specific errors into our own error types so the
 * route layer doesn't need to know about IndianAPI at all.
 */
export async function getStockReturns(tickerInput) {
  const ticker = tickerInput.trim().toUpperCase();
  const cacheKey = `returns:${ticker}`;

  const cached = getCached(cacheKey);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  let stockRaw;
  let historicalRaw;

  try {
    // These two could be parallelized, but the shared 1 req/sec throttle in the
    // IndianAPI client already serializes them safely either way.
    stockRaw = await fetchStockData(ticker);
    historicalRaw = await fetchHistoricalData(ticker, '10yr');
  } catch (err) {
    if (err instanceof IndianApiError) {
      if (err.code === 'NOT_FOUND') {
        throw new StockNotFoundError(ticker);
      }
      if (err.code === 'MISSING_API_KEY' || err.code === 'INVALID_API_KEY') {
        // Distinct from "ticker not found" - this is a configuration problem, not user input.
        throw new UpstreamUnavailableError('The server is not configured with a valid IndianAPI key.');
      }
      throw new UpstreamUnavailableError('The stock data provider is temporarily unavailable. Please try again shortly.');
    }
    throw err;
  }

  const stockInfo = parseStockResponse(stockRaw, ticker);
  const priceSeries = parseHistoricalResponse(historicalRaw);

  const periods = computeAllPeriods(stockInfo.currentPrice, priceSeries);

  const result = {
    ticker: stockInfo.ticker,
    companyName: stockInfo.companyName,
    currentPrice: stockInfo.currentPrice,
    asOf: new Date().toISOString(),
    periods,
  };

  setCached(cacheKey, result);
  return { ...result, fromCache: false };
}
