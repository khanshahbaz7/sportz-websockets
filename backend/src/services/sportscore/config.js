const DEFAULT_COMPETITIONS = [
  'football:english-premier-league',
  'football:spanish-la-liga',
  'football:italian-serie-a',
  'football:french-ligue-1',
];

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseNumber(value, fallback, { min = 0 } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return parsed;
}

export function parseCompetitions(value) {
  const entries = String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  const competitions = [];
  for (const entry of entries) {
    const separator = entry.indexOf(':');
    if (separator === -1) continue;

    const sport = entry.slice(0, separator).trim().toLowerCase();
    const slug = entry.slice(separator + 1).trim();
    if (!slug || !['football', 'cricket'].includes(sport)) continue;

    competitions.push({ sport, slug });
  }

  return competitions;
}

export function loadSportScoreConfig(env = process.env) {
  // An explicitly empty SPORTSCORE_COMPETITIONS means "discover globally".
  // If the variable is absent, fall back to the curated default competitions.
  const competitions = Object.prototype.hasOwnProperty.call(
    env,
    'SPORTSCORE_COMPETITIONS',
  )
    ? parseCompetitions(env.SPORTSCORE_COMPETITIONS)
    : parseCompetitions(DEFAULT_COMPETITIONS.join(','));

  return {
    baseUrl: (env.SPORTSCORE_BASE_URL || 'https://sportscore.com').replace(/\/+$/, ''),
    apiKey: env.SPORTSCORE_API_KEY || null,
    src: env.SPORTSCORE_SRC || 'sportz-dashboard',
    userAgent:
      env.SPORTSCORE_USER_AGENT ||
      'sportz-dashboard/1.0 (+https://sportscore.com/developers/)',

    pollEnabled: parseBoolean(env.SPORTSCORE_POLL_ENABLED, true),
    autoImport: parseBoolean(env.SPORTSCORE_AUTO_IMPORT, false),
    ingestSubstitutions: parseBoolean(env.SPORTSCORE_INGEST_SUBSTITUTIONS, false),
    cricketEnabled: parseBoolean(env.SPORTSCORE_CRICKET_ENABLED, true),

    pollIntervalMs: Math.max(
      parseNumber(env.SPORTSCORE_POLL_INTERVAL_MS, 120_000),
      60_000,
    ),
    detailPollIntervalMs: Math.max(
      parseNumber(env.SPORTSCORE_DETAIL_POLL_INTERVAL_MS, 180_000),
      30_000,
    ),
    requestTimeoutMs: Math.max(
      parseNumber(env.SPORTSCORE_REQUEST_TIMEOUT_MS, 10_000),
      1_000,
    ),
    maxRequestsPerDay: Math.max(
      parseNumber(env.SPORTSCORE_MAX_REQUESTS_PER_DAY, 9_000),
      1,
    ),
    autoImportWindowHours: Math.max(
      parseNumber(env.SPORTSCORE_AUTO_IMPORT_WINDOW_HOURS, 6),
      0,
    ),
    reconcileLimit: Math.max(
      parseNumber(env.SPORTSCORE_RECONCILE_LIMIT, 25),
      0,
    ),

    footballCompetitions: competitions
      .filter((entry) => entry.sport === 'football')
      .map((entry) => entry.slug),
    cricketCompetitions: competitions
      .filter((entry) => entry.sport === 'cricket')
      .map((entry) => entry.slug),
  };
}
