export class SportScoreError extends Error {
  constructor(message, { status = null, code = 'SPORTSCORE_ERROR', url = null, body = null } = {}) {
    super(message);
    this.name = 'SportScoreError';
    this.status = status;
    this.code = code;
    this.url = url;
    this.body = body;
  }
}

class RequestBudget {
  constructor(maxPerDay) {
    this.maxPerDay = maxPerDay;
    this.day = null;
    this.count = 0;
  }

  resetIfNeeded(now = new Date()) {
    const day = now.toISOString().slice(0, 10);
    if (this.day !== day) {
      this.day = day;
      this.count = 0;
    }
  }

  canRequest(count = 1, now = new Date()) {
    this.resetIfNeeded(now);
    return this.count + count <= this.maxPerDay;
  }

  record(count = 1, now = new Date()) {
    this.resetIfNeeded(now);
    this.count += count;
  }

  usage(now = new Date()) {
    this.resetIfNeeded(now);
    return {
      day: this.day,
      count: this.count,
      max: this.maxPerDay,
      remaining: Math.max(this.maxPerDay - this.count, 0),
    };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildTimeoutSignal(timeoutMs) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timer.unref === 'function') timer.unref();
  return controller.signal;
}

function shouldRetryStatus(status) {
  return status === 429 || status === 408 || status >= 500;
}

export class SportScoreClient {
  constructor({
    baseUrl = 'https://sportscore.com',
    apiKey = null,
    src = 'sportz-dashboard',
    userAgent = 'sportz-dashboard/1.0',
    timeoutMs = 10_000,
    maxRequestsPerDay = 9_000,
    fetchImpl = globalThis.fetch,
    logger = console,
    maxRetries = 2,
  } = {}) {
    if (typeof fetchImpl !== 'function') {
      throw new Error('SportScoreClient requires a fetch implementation');
    }

    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.src = src;
    this.userAgent = userAgent;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
    this.maxRetries = maxRetries;
    this.budget = new RequestBudget(maxRequestsPerDay);
  }

  getUsage() {
    return this.budget.usage();
  }

  async request(path, params = {}, { timeoutMs = this.timeoutMs } = {}) {
    const url = new URL(path, `${this.baseUrl}/`);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
    if (this.src && !url.searchParams.has('src')) {
      url.searchParams.set('src', this.src);
    }

    const headers = {
      Accept: 'application/json',
      'User-Agent': this.userAgent,
    };
    if (this.apiKey) headers['X-Api-Key'] = this.apiKey;

    let lastError = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      if (!this.budget.canRequest(1)) {
        throw new SportScoreError('SportScore daily request budget exhausted', {
          code: 'SPORTSCORE_BUDGET_EXHAUSTED',
          url: url.toString(),
        });
      }

      this.budget.record(1);

      let response;
      try {
        response = await this.fetchImpl(url, {
          method: 'GET',
          headers,
          signal: buildTimeoutSignal(timeoutMs),
        });
      } catch (error) {
        lastError = new SportScoreError(
          `SportScore request failed: ${error?.message || error}`,
          { code: 'SPORTSCORE_NETWORK_ERROR', url: url.toString() },
        );

        if (attempt < this.maxRetries) {
          await sleep(this.retryDelay(attempt));
          continue;
        }
        throw lastError;
      }

      const text = await response.text();
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }

      if (response.ok) {
        if (body === null) {
          throw new SportScoreError('SportScore returned invalid JSON', {
            status: response.status,
            code: 'SPORTSCORE_INVALID_JSON',
            url: url.toString(),
            body: text.slice(0, 500),
          });
        }
        return body;
      }

      const message =
        body?.error || `SportScore request failed with HTTP ${response.status}`;

      lastError = new SportScoreError(message, {
        status: response.status,
        code:
          response.status === 429
            ? 'SPORTSCORE_RATE_LIMITED'
            : response.status >= 500
              ? 'SPORTSCORE_SERVER_ERROR'
              : 'SPORTSCORE_HTTP_ERROR',
        url: url.toString(),
        body: text.slice(0, 500),
      });

      if (attempt < this.maxRetries && shouldRetryStatus(response.status)) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : this.retryDelay(attempt);
        await sleep(delay);
        continue;
      }

      throw lastError;
    }

    throw lastError;
  }

  retryDelay(attempt) {
    const base = Math.min(500 * 2 ** attempt, 4_000);
    return base + Math.floor(Math.random() * 250);
  }

  getFixtures({ sport, date, competition, status, limit = 200 } = {}) {
    return this.request('/api/v1/fixtures', {
      sport,
      date,
      competition,
      status,
      limit,
    });
  }

  getMatch({ sport, slug } = {}) {
    return this.request('/api/widget/match/', { sport, slug });
  }

  search({ sport, q } = {}) {
    return this.request('/api/v1/search', { sport, q });
  }
}
