import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadSportScoreConfig,
  parseCompetitions,
} from '../src/services/sportscore/config.js';

test('parseCompetitions accepts sport:slug entries', () => {
  assert.deepEqual(
    parseCompetitions('football:english-premier-league, cricket:big-bash-league'),
    [
      { sport: 'football', slug: 'english-premier-league' },
      { sport: 'cricket', slug: 'big-bash-league' },
    ],
  );
});

test('parseCompetitions ignores invalid entries', () => {
  assert.deepEqual(
    parseCompetitions('english-premier-league,tennis:atp,basketball:nba,football:'),
    [],
  );
});

test('loadSportScoreConfig applies defaults', () => {
  const config = loadSportScoreConfig({});

  assert.equal(config.baseUrl, 'https://sportscore.com');
  assert.equal(config.pollEnabled, true);
  assert.equal(config.autoImport, false);
  assert.equal(config.ingestSubstitutions, false);
  assert.equal(config.cricketEnabled, true);
  assert.equal(config.pollIntervalMs, 120000);
  assert.deepEqual(config.footballCompetitions, [
    'english-premier-league',
    'spanish-la-liga',
    'italian-serie-a',
    'french-ligue-1',
  ]);
  assert.deepEqual(config.cricketCompetitions, []);
});

test('loadSportScoreConfig treats an explicit empty competition list as global discovery', () => {
  const config = loadSportScoreConfig({ SPORTSCORE_COMPETITIONS: '' });

  assert.deepEqual(config.footballCompetitions, []);
  assert.deepEqual(config.cricketCompetitions, []);
});

test('loadSportScoreConfig reads overrides and clamps values', () => {
  const config = loadSportScoreConfig({
    SPORTSCORE_BASE_URL: 'https://example.test/',
    SPORTSCORE_POLL_ENABLED: 'false',
    SPORTSCORE_AUTO_IMPORT: 'yes',
    SPORTSCORE_INGEST_SUBSTITUTIONS: '1',
    SPORTSCORE_CRICKET_ENABLED: 'off',
    SPORTSCORE_POLL_INTERVAL_MS: '10',
    SPORTSCORE_DETAIL_POLL_INTERVAL_MS: '5',
    SPORTSCORE_REQUEST_TIMEOUT_MS: '1',
    SPORTSCORE_MAX_REQUESTS_PER_DAY: '0',
    SPORTSCORE_COMPETITIONS: 'football:eredivisie,cricket:ipl',
  });

  assert.equal(config.baseUrl, 'https://example.test');
  assert.equal(config.pollEnabled, false);
  assert.equal(config.autoImport, true);
  assert.equal(config.ingestSubstitutions, true);
  assert.equal(config.cricketEnabled, false);
  assert.equal(config.pollIntervalMs, 60000);
  assert.equal(config.detailPollIntervalMs, 30000);
  assert.equal(config.requestTimeoutMs, 1000);
  assert.equal(config.maxRequestsPerDay, 1);
  assert.deepEqual(config.footballCompetitions, ['eredivisie']);
  assert.deepEqual(config.cricketCompetitions, ['ipl']);
});
