import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SportScoreClient,
  SportScoreError,
} from '../src/services/sportscore/client.js';

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => headers[String(name).toLowerCase()] ?? null,
    },
    text: async () => JSON.stringify(body),
  };
}

test('request sends query params, src, user agent, and API key', async () => {
  const calls = [];
  const client = new SportScoreClient({
    baseUrl: 'https://sportscore.test',
    apiKey: 'secret',
    src: 'sportz-dashboard',
    userAgent: 'sportz-test',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ ok: true });
    },
  });

  const result = await client.request('/api/v1/fixtures', {
    sport: 'football',
    date: '2026-11-23',
    empty: '',
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(calls.length, 1);

  const [{ url, options }] = calls;
  assert.equal(url.origin, 'https://sportscore.test');
  assert.equal(url.pathname, '/api/v1/fixtures');
  assert.equal(url.searchParams.get('sport'), 'football');
  assert.equal(url.searchParams.get('date'), '2026-11-23');
  assert.equal(url.searchParams.has('empty'), false);
  assert.equal(url.searchParams.get('src'), 'sportz-dashboard');
  assert.equal(options.headers['User-Agent'], 'sportz-test');
  assert.equal(options.headers['X-Api-Key'], 'secret');
});

test('request retries retryable failures', async () => {
  let calls = 0;
  const client = new SportScoreClient({
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return jsonResponse({ error: 'nope' }, { status: 503 });
      return jsonResponse({ ok: true });
    },
    maxRetries: 1,
  });
  client.retryDelay = () => 0;

  const result = await client.request('/api/v1/fixtures');

  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 2);
});

test('request throws on non-retryable HTTP errors', async () => {
  const client = new SportScoreClient({
    fetchImpl: async () => jsonResponse({ error: 'not found' }, { status: 404 }),
  });

  await assert.rejects(
    () => client.request('/api/v1/fixtures'),
    (error) => {
      assert.ok(error instanceof SportScoreError);
      assert.equal(error.status, 404);
      assert.equal(error.code, 'SPORTSCORE_HTTP_ERROR');
      assert.equal(error.message, 'not found');
      return true;
    },
  );
});

test('request enforces the daily budget', async () => {
  const client = new SportScoreClient({
    maxRequestsPerDay: 1,
    fetchImpl: async () => jsonResponse({ ok: true }),
  });

  await client.request('/api/v1/fixtures');
  assert.deepEqual(client.getUsage().remaining, 0);

  await assert.rejects(
    () => client.request('/api/v1/fixtures'),
    (error) => {
      assert.equal(error.code, 'SPORTSCORE_BUDGET_EXHAUSTED');
      return true;
    },
  );
});

test('request rejects invalid JSON', async () => {
  const client = new SportScoreClient({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => '<html>oops</html>',
    }),
  });

  await assert.rejects(
    () => client.request('/api/v1/fixtures'),
    (error) => {
      assert.equal(error.code, 'SPORTSCORE_INVALID_JSON');
      return true;
    },
  );
});
