/**
 * Pure, dependency-free calculation functions.
 * No I/O here on purpose — these are unit tested in isolation (see tests/calculations.test.js).
 */

/**
 * Point-to-point percentage return.
 * ((latest - reference) / reference) * 100
 *
 * @param {number} latestPrice
 * @param {number} referencePrice
 * @returns {number|null} null if the calculation is not meaningful (reference <= 0)
 */
export function calculateReturn(latestPrice, referencePrice) {
  if (!isFiniteNumber(latestPrice) || !isFiniteNumber(referencePrice)) return null;
  if (referencePrice === 0) return null; // avoid division by zero
  return ((latestPrice - referencePrice) / referencePrice) * 100;
}

/**
 * CAGR (annualized return) for a given number of years.
 * ((latest / reference) ^ (1/years) - 1) * 100
 *
 * Guards against a negative or zero reference/latest price, which would produce
 * a complex number (NaN in JS) when raised to a fractional power.
 *
 * @param {number} latestPrice
 * @param {number} referencePrice
 * @param {number} years
 * @returns {number|null}
 */
export function calculateCAGR(latestPrice, referencePrice, years) {
  if (!isFiniteNumber(latestPrice) || !isFiniteNumber(referencePrice) || !isFiniteNumber(years)) {
    return null;
  }
  if (referencePrice <= 0 || latestPrice <= 0 || years <= 0) {
    // A negative or zero base makes fractional exponentiation meaningless (NaN).
    return null;
  }
  const ratio = latestPrice / referencePrice;
  const cagr = (Math.pow(ratio, 1 / years) - 1) * 100;
  return isFiniteNumber(cagr) ? cagr : null;
}

/**
 * Round a number to a fixed number of decimals, returning null through unchanged.
 * Rounding happens only at the final display step — all intermediate math stays
 * full precision (see calculateReturn/calculateCAGR above).
 *
 * @param {number|null} value
 * @param {number} decimals
 */
export function roundDisplay(value, decimals = 2) {
  if (value === null || value === undefined || !isFiniteNumber(value)) return null;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Given a sorted (ascending by date) list of [dateString, priceString] pairs and a
 * target date, find the closing price on the nearest PRIOR trading day.
 *
 * "Prior" (not nearest either direction) is the standard convention for return
 * calculations and avoids look-ahead bias.
 *
 * @param {Array<[string, string|number]>} series - ascending by date, e.g. [["2024-01-01", "123.45"], ...]
 * @param {Date} targetDate
 * @param {number} maxLookbackDays - refuse to walk back further than this many days
 * @returns {{ price: number, date: string } | null}
 */
export function findClosestPriorClose(series, targetDate, maxLookbackDays = 10) {
  if (!Array.isArray(series) || series.length === 0) return null;

  const targetTime = targetDate.getTime();
  const earliestAcceptableTime = targetTime - maxLookbackDays * 24 * 60 * 60 * 1000;

  // Series is ascending by date; walk backwards from the end to find the
  // latest entry whose date is <= targetDate.
  let best = null;
  for (let i = series.length - 1; i >= 0; i--) {
    const [dateStr, priceRaw] = series[i];
    const entryTime = new Date(dateStr + 'T00:00:00Z').getTime();
    if (entryTime <= targetTime) {
      best = { dateStr, entryTime, priceRaw };
      break;
    }
  }

  if (!best) return null; // every entry is after targetDate (e.g. pre-listing)
  if (best.entryTime < earliestAcceptableTime) return null; // too far back, treat as no data

  const price = parseFloat(best.priceRaw);
  if (!isFiniteNumber(price)) return null;

  return { price, date: best.dateStr };
}

/**
 * Subtract a whole number of calendar months from a date, using calendar month
 * arithmetic (not a fixed day count) to avoid drift.
 */
export function subtractMonths(date, months) {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

/** Subtract a whole number of calendar years. */
export function subtractYears(date, years) {
  const d = new Date(date.getTime());
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
}

/** Subtract a whole number of calendar days. */
export function subtractDays(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}
