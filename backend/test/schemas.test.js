import test from 'node:test';
import assert from 'node:assert/strict';
import { SportScoreError } from '../src/services/sportscore/client.js';
import {
  parseFixturesResponse,
  parseMatchResponse,
} from '../src/services/sportscore/schemas.js';

test('parseFixturesResponse accepts a fixture list', () => {
  const parsed = parseFixturesResponse({
    sport: 'football',
    date: '2026-11-23',
    count: 1,
    matches: [
      {
        home: 'Arsenal',
        away: 'Chelsea',
        home_score: '2',
        away_score: '1',
        status: 'live',
        status_text: '2nd half',
        time: '2026-11-23T15:00:00Z',
        competition: 'Premier League',
        url: 'https://sportscore.com/football/match/arsenal-vs-chelsea/12345/',
      },
    ],
  });

  assert.equal(parsed.matches.length, 1);
  assert.equal(parsed.matches[0].home, 'Arsenal');
});

test('parseFixturesResponse rejects malformed payloads', () => {
  assert.throws(
    () => parseFixturesResponse({ matches: [{ away: 'Chelsea' }] }),
    (error) => {
      assert.ok(error instanceof SportScoreError);
      assert.equal(error.code, 'SPORTSCORE_INVALID_RESPONSE');
      return true;
    },
  );
});

test('parseMatchResponse defaults optional collections', () => {
  const parsed = parseMatchResponse({
    sport: 'cricket',
    match: {
      home: 'India',
      away: 'Australia',
      status: 'live',
      url: 'https://sportscore.com/cricket/match/india-vs-australia/',
      tracker: { id: 'abc123' },
    },
  });

  assert.equal(parsed.match.tracker.id, 'abc123');
  assert.deepEqual(parsed.match.incidents, []);
  assert.deepEqual(parsed.match.stats, []);
  assert.equal(parsed.match.lineups, null);
});
