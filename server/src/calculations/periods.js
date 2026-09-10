import {
  calculateReturn,
  calculateCAGR,
  roundDisplay,
  findClosestPriorClose,
  subtractMonths,
  subtractYears,
  subtractDays,
} from './returns.js';

// Per the assignment brief section 3.3. `years` is only set for periods that need CAGR.
const PERIOD_DEFINITIONS = [
  { key: '1D', label: '1 Day', getReferenceDate: (now) => subtractDays(now, 1) },
  { key: '1W', label: '1 Week', getReferenceDate: (now) => subtractDays(now, 7) },
  { key: '1M', label: '1 Month', getReferenceDate: (now) => subtractMonths(now, 1) },
  { key: '3M', label: '3 Months', getReferenceDate: (now) => subtractMonths(now, 3) },
  { key: '6M', label: '6 Months', getReferenceDate: (now) => subtractMonths(now, 6) },
  { key: '1Y', label: '1 Year', getReferenceDate: (now) => subtractYears(now, 1) },
  { key: '3Y', label: '3 Years', getReferenceDate: (now) => subtractYears(now, 3), years: 3 },
  { key: '5Y', label: '5 Years', getReferenceDate: (now) => subtractYears(now, 5), years: 5 },
];

/**
 * Compute all required periods for a given latest price + historical series.
 * Never throws for a single missing period — each period is independently
 * marked with a status so one gap (e.g. insufficient 5Y history) never fails
 * the whole response (graceful partial success).
 *
 * @param {number} latestPrice
 * @param {Array<[string, string]>} priceSeries - ascending by date
 * @param {Date} now - injectable for testability
 * @param {number} maxLookbackDays
 */
export function computeAllPeriods(latestPrice, priceSeries, now = new Date(), maxLookbackDays = 10) {
  const result = {};

  for (const def of PERIOD_DEFINITIONS) {
    const targetDate = def.getReferenceDate(now);
    const match = findClosestPriorClose(priceSeries, targetDate, maxLookbackDays);

    if (!match) {
      result[def.key] = {
        return: null,
        cagr: def.years ? null : undefined,
        status: 'insufficient_history',
      };
      continue;
    }

    const pointToPoint = calculateReturn(latestPrice, match.price);
    const entry = {
      return: roundDisplay(pointToPoint),
      referenceDate: match.date,
      referencePrice: match.price,
      status: 'ok',
    };

    if (def.years) {
      const cagr = calculateCAGR(latestPrice, match.price, def.years);
      entry.cagr = cagr === null ? null : roundDisplay(cagr);
      if (cagr === null) {
        // Point-to-point could still be valid even if CAGR guard tripped
        // (e.g. a negative reference price) - keep return, null the CAGR only.
        entry.status = pointToPoint === null ? 'insufficient_history' : 'ok';
      }
    }

    result[def.key] = entry;
  }

  return result;
}

export { PERIOD_DEFINITIONS };
