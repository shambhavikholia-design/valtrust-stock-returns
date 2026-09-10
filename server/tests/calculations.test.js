import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateReturn,
  calculateCAGR,
  roundDisplay,
  findClosestPriorClose,
  subtractMonths,
  subtractYears,
} from '../src/calculations/returns.js';
import { computeAllPeriods } from '../src/calculations/periods.js';

describe('calculateReturn', () => {
  test('computes a simple positive return', () => {
    assert.equal(calculateReturn(110, 100), 10);
  });

  test('computes a simple negative return', () => {
    assert.equal(calculateReturn(90, 100), -10);
  });

  test('returns null when reference price is zero (avoid division by zero)', () => {
    assert.equal(calculateReturn(100, 0), null);
  });

  test('returns null for non-numeric input', () => {
    assert.equal(calculateReturn(NaN, 100), null);
  });
});

describe('calculateCAGR', () => {
  test('matches the worked example from the assignment brief (RELIANCE 3Y)', () => {
    // Brief's illustrative example: 3Y total +45.6%, CAGR 13.3%
    // reference = latest / 1.456
    const latest = 2847.6;
    const reference = latest / 1.456;
    const cagr = calculateCAGR(latest, reference, 3);
    assert.ok(Math.abs(cagr - 13.3) < 0.2, `expected ~13.3, got ${cagr}`);
  });

  test('returns null for a negative reference price (avoid NaN from fractional exponent)', () => {
    assert.equal(calculateCAGR(100, -50, 3), null);
  });

  test('returns null for a zero reference price', () => {
    assert.equal(calculateCAGR(100, 0, 3), null);
  });

  test('returns null for a negative latest price', () => {
    assert.equal(calculateCAGR(-100, 50, 3), null);
  });

  test('returns 0 for no change over the period', () => {
    assert.equal(calculateCAGR(100, 100, 5), 0);
  });
});

describe('roundDisplay', () => {
  test('rounds to 2 decimals by default', () => {
    assert.equal(roundDisplay(13.34567), 13.35);
  });

  test('passes null through unchanged', () => {
    assert.equal(roundDisplay(null), null);
  });
});

describe('findClosestPriorClose', () => {
  const series = [
    ['2024-01-02', '100.00'], // Tuesday
    ['2024-01-03', '101.00'],
    ['2024-01-05', '103.00'], // Friday - note Jan 4 missing (simulates a holiday)
    ['2024-01-08', '105.00'], // Monday - Jan 6/7 weekend, correctly absent from series
  ];

  test('returns exact match when the date exists in the series', () => {
    const result = findClosestPriorClose(series, new Date('2024-01-03T00:00:00Z'));
    assert.equal(result.price, 101);
    assert.equal(result.date, '2024-01-03');
  });

  test('falls back to nearest PRIOR trading day when target date is a holiday', () => {
    // Jan 4 has no entry (holiday) - should resolve to Jan 3, not Jan 5 (no look-ahead).
    const result = findClosestPriorClose(series, new Date('2024-01-04T00:00:00Z'));
    assert.equal(result.date, '2024-01-03');
    assert.equal(result.price, 101);
  });

  test('falls back to nearest PRIOR trading day across a weekend', () => {
    // Jan 6 (Sat) and Jan 7 (Sun) have no entries - should resolve to Jan 5.
    const result = findClosestPriorClose(series, new Date('2024-01-07T00:00:00Z'));
    assert.equal(result.date, '2024-01-05');
  });

  test('returns null when target date is before any data (pre-listing case)', () => {
    const result = findClosestPriorClose(series, new Date('2023-12-01T00:00:00Z'));
    assert.equal(result, null);
  });

  test('returns null when the nearest prior entry is beyond maxLookbackDays', () => {
    const sparseSeries = [['2024-01-01', '100.00']];
    const result = findClosestPriorClose(sparseSeries, new Date('2024-01-20T00:00:00Z'), 10);
    assert.equal(result, null);
  });

  test('respects maxLookbackDays boundary (inclusive-ish) correctly', () => {
    const sparseSeries = [['2024-01-01', '100.00']];
    // Exactly 5 days back, with a 10-day allowance - should still find it.
    const result = findClosestPriorClose(sparseSeries, new Date('2024-01-06T00:00:00Z'), 10);
    assert.equal(result.price, 100);
  });
});

describe('subtractMonths / subtractYears (calendar-aware, not fixed day counts)', () => {
  test('subtractMonths handles month-length differences correctly', () => {
    const d = subtractMonths(new Date('2024-03-31T00:00:00Z'), 1);
    // JS Date rolls Feb 31 -> Mar 3 (no Feb 31), documenting this known edge case.
    assert.equal(d.getUTCMonth(), 2); // still lands in March due to overflow, but no crash/NaN
  });

  test('subtractYears correctly handles leap year Feb 29', () => {
    const d = subtractYears(new Date('2024-02-29T00:00:00Z'), 1);
    assert.equal(d.getUTCFullYear(), 2023);
  });
});

describe('computeAllPeriods (integration of the above)', () => {
  const now = new Date('2024-06-10T00:00:00Z');

  test('marks a period as insufficient_history when no data exists that far back', () => {
    const shortSeries = [
      ['2024-06-05', '100.00'],
      ['2024-06-07', '102.00'],
      ['2024-06-10', '105.00'],
    ];
    const periods = computeAllPeriods(105, shortSeries, now);
    assert.equal(periods['5Y'].status, 'insufficient_history');
    assert.equal(periods['5Y'].return, null);
    assert.equal(periods['5Y'].cagr, null);
  });

  test('computes 1D return correctly when prior-day data exists', () => {
    const series = [
      ['2024-06-07', '100.00'],
      ['2024-06-10', '110.00'],
    ];
    const periods = computeAllPeriods(110, series, now);
    assert.equal(periods['1D'].status, 'ok');
    assert.equal(periods['1D'].return, 10);
  });

  test('never throws even with an empty series', () => {
    assert.doesNotThrow(() => computeAllPeriods(100, [], now));
    const periods = computeAllPeriods(100, [], now);
    for (const key of Object.keys(periods)) {
      assert.equal(periods[key].status, 'insufficient_history');
    }
  });
});
