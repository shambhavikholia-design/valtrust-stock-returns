import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

/**
 * These tests exercise the actual Express routes end-to-end (HTTP layer,
 * validation middleware, error handler) rather than testing pure functions
 * in isolation. They intentionally only cover paths that DON'T require a
 * real IndianAPI call, so they run in CI without needing a real API key:
 * input validation, health check, and unknown-route handling.
 *
 * A real ticker lookup (e.g. /api/returns/RELIANCE) is NOT tested here since
 * it requires a live IndianAPI key and network access - that's verified
 * manually against the deployed app instead (see README).
 */

let server;
let baseUrl;

before(async () => {
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      // Port 0 asks the OS for any free port, avoiding collisions in CI.
      const { port } = server.address();
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('GET /api/health', () => {
  test('returns 200 with status ok', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.ok(body.cache);
    assert.ok(typeof body.cache.size === 'number');
  });
});

describe('GET /api/returns/:ticker - input validation', () => {
  test('rejects an empty ticker with 400', async () => {
    const res = await fetch(`${baseUrl}/api/returns/%20`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, 'EMPTY_TICKER');
  });

  test('rejects a malformed ticker (special characters) with 400', async () => {
    const res = await fetch(`${baseUrl}/api/returns/${encodeURIComponent('BAD$TICKER!!')}`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, 'INVALID_TICKER_FORMAT');
  });

  test('rejects a ticker over 20 characters with 400', async () => {
    const longTicker = 'A'.repeat(25);
    const res = await fetch(`${baseUrl}/api/returns/${longTicker}`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, 'INVALID_TICKER_FORMAT');
  });

  test('every error response follows the same { error: { code, message } } shape', async () => {
    const res = await fetch(`${baseUrl}/api/returns/%20`);
    const body = await res.json();
    assert.ok(body.error);
    assert.equal(typeof body.error.code, 'string');
    assert.equal(typeof body.error.message, 'string');
  });

  test('accepts a numeric BSE code as valid ticker format (does not 400)', async () => {
    const res = await fetch(`${baseUrl}/api/returns/500325`);
    // We only assert it passes validation and doesn't immediately reject as
    // malformed - it may still succeed (200) or hit IndianAPI directly, so we
    // just confirm it's not rejected for its numeric shape (not a 400).
    assert.notEqual(res.status, 400);
    });
});

describe('Unknown routes', () => {
  test('returns 404 with a clear message for an unknown API route', async () => {
    const res = await fetch(`${baseUrl}/api/this-route-does-not-exist`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error.code, 'ROUTE_NOT_FOUND');
  });
});

describe('Static frontend serving', () => {
  test('serves the frontend index.html at the root path', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    const contentType = res.headers.get('content-type') || '';
    assert.ok(contentType.includes('text/html'));
  });
});