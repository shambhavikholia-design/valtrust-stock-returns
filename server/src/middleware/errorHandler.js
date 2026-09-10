import { StockNotFoundError, UpstreamUnavailableError } from '../services/stockService.js';

/**
 * Every error response from this API follows the same shape:
 *   { error: { code: string, message: string } }
 * Expected errors (bad ticker, insufficient history, upstream down) get calm,
 * specific messages. Unexpected errors get a generic message plus a server-side
 * log - we never leak raw stack traces to the client.
 */
export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof StockNotFoundError) {
    return res.status(404).json({
      error: { code: 'TICKER_NOT_FOUND', message: err.message },
    });
  }

  if (err instanceof UpstreamUnavailableError) {
    console.warn('[upstream-unavailable]', err.message);
    return res.status(502).json({
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'The stock data provider is temporarily unavailable. Please try again in a moment.',
      },
    });
  }

  // Unexpected/unclassified error - log full detail server-side, keep client response generic.
  console.error('[unhandled-error]', err);
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our end. Please try again.',
    },
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: 'ROUTE_NOT_FOUND', message: `No route for ${req.method} ${req.originalUrl}` },
  });
}
