/**
 * Validates and normalizes the ticker route param before it reaches business logic.
 * Never trust client-side validation alone - this runs regardless of what the
 * frontend already checked.
 */
export function validateTicker(req, res, next) {
  const raw = req.params.ticker;

  if (!raw || typeof raw !== 'string' || raw.trim().length === 0) {
    return res.status(400).json({
      error: {
        code: 'EMPTY_TICKER',
        message: 'Please provide a ticker symbol.',
      },
    });
  }

  const trimmed = raw.trim();

  // Reasonable bounds: NSE tickers are short, alphanumeric (occasionally with & or -).
  if (trimmed.length > 20 || !/^[A-Za-z0-9&\-.]+$/.test(trimmed)) {
    return res.status(400).json({
      error: {
        code: 'INVALID_TICKER_FORMAT',
        message: 'That does not look like a valid ticker symbol.',
      },
    });
  }

  req.params.ticker = trimmed.toUpperCase();
  next();
}
