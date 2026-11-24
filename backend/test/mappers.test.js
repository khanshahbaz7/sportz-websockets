import test from 'node:test';
import assert from 'node:assert/strict';
import { MATCH_STATUS } from '../src/validation/matches.js';
import {
  diffMatch,
  hashIncident,
  incidentMessage,
  mapDetail,
  mapFixture,
  mapIncidentsToCommentary,
  mapStatus,
  normalizeTeamName,
  parseCricketScore,
} from '../src/services/sportscore/mappers.js';

test('mapStatus normalizes provider statuses', () => {
  assert.equal(mapStatus('upcoming'), MATCH_STATUS.SCHEDULED);
  assert.equal(mapStatus('live'), MATCH_STATUS.LIVE);
  assert.equal(mapStatus('finished'), MATCH_STATUS.FINISHED);
  assert.equal(mapStatus('IN_PROGRESS'), MATCH_STATUS.LIVE);
  assert.equal(mapStatus('postponed'), null);
});

test('parseCricketScore extracts runs and wickets', () => {
  assert.deepEqual(parseCricketScore('353/3'), {
    runs: 353,
    wickets: 3,
    text: '353/3',
  });
  assert.deepEqual(parseCricketScore('120'), {
    runs: 120,
    wickets: null,
    text: '120',
  });
  assert.deepEqual(parseCricketScore('-'), {
    runs: null,
    wickets: null,
    text: '-',
  });
  assert.deepEqual(parseCricketScore(null), {
    runs: null,
    wickets: null,
    text: null,
  });
});

test('mapFixture maps football fixtures and extracts the stable id', () => {
  const mapped = mapFixture(
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
    { sport: 'football', competitionSlug: 'english-premier-league' },
  );

  assert.equal(mapped.externalId, '12345');
  assert.equal(mapped.externalSlug, 'arsenal-vs-chelsea');
  assert.equal(mapped.homeScore, 2);
  assert.equal(mapped.awayScore, 1);
  assert.equal(mapped.homeScoreText, '2');
  assert.equal(mapped.status, MATCH_STATUS.LIVE);
  assert.equal(mapped.statusText, '2nd half');
  assert.equal(mapped.competitionSlug, 'english-premier-league');
  assert.ok(mapped.startTime instanceof Date);
});

test('mapFixture maps cricket scores with wickets', () => {
  const mapped = mapFixture(
    {
      home: 'India',
      away: 'Australia',
      home_score: '353/3',
      away_score: '210/8',
      status: 'live',
      status_text: '1st innings (home)',
      time: '2026-11-23T03:00:00Z',
      competition: 'ODI Series',
      url: 'https://sportscore.com/cricket/match/india-vs-australia/',
    },
    { sport: 'cricket' },
  );

  assert.equal(mapped.externalId, null);
  assert.equal(mapped.externalSlug, 'india-vs-australia');
  assert.equal(mapped.homeScore, 353);
  assert.equal(mapped.homeWickets, 3);
  assert.equal(mapped.awayScore, 210);
  assert.equal(mapped.awayWickets, 8);
});

test('mapDetail reads tracker id, minute, and half-time scores', () => {
  const mapped = mapDetail(
    {
      home: 'Arsenal',
      away: 'Chelsea',
      home_score: '2',
      away_score: '1',
      status: 'live',
      status_text: '2nd half',
      time: '2026-11-23T15:00:00Z',
      url: 'https://sportscore.com/football/match/arsenal-vs-chelsea/12345/',
      live_minute: '63',
      home_ht_score: '1',
      away_ht_score: '0',
      tracker: { id: '12345' },
      incidents: [],
      stats: [],
      lineups: null,
    },
    { sport: 'football' },
  );

  assert.equal(mapped.externalId, '12345');
  assert.equal(mapped.liveMinute, '63');
  assert.equal(mapped.homeHtScore, 1);
  assert.equal(mapped.awayHtScore, 0);
});

test('diffMatch never overwrites known scores with null', () => {
  const existing = {
    status: MATCH_STATUS.LIVE,
    statusText: '1st half',
    liveMinute: '30',
    homeScore: 1,
    awayScore: 0,
    homeWickets: null,
    awayWickets: null,
    homeScoreText: '1',
    awayScoreText: '0',
    homeHtScore: null,
    awayHtScore: null,
    competition: 'Premier League',
    competitionSlug: 'english-premier-league',
    externalId: '12345',
    externalSlug: 'arsenal-vs-chelsea',
  };

  const diff = diffMatch(existing, {
    status: MATCH_STATUS.LIVE,
    liveMinute: '31',
    homeScore: null,
    awayScore: null,
    homeScoreText: null,
    awayScoreText: null,
    homeWickets: null,
    awayWickets: null,
  });

  assert.equal(diff.changed, true);
  assert.deepEqual(diff.changes, ['liveMinute']);
  assert.equal(diff.next.liveMinute, '31');
  assert.equal('homeScore' in diff.next, false);
  assert.equal('awayScore' in diff.next, false);
});

test('diffMatch reports no changes when provider data is unchanged', () => {
  const existing = {
    status: MATCH_STATUS.LIVE,
    statusText: '2nd half',
    liveMinute: '63',
    homeScore: 2,
    awayScore: 1,
    homeWickets: null,
    awayWickets: null,
    homeScoreText: '2',
    awayScoreText: '1',
    homeHtScore: 1,
    awayHtScore: 0,
    competition: 'Premier League',
    competitionSlug: 'english-premier-league',
    externalId: '12345',
    externalSlug: 'arsenal-vs-chelsea',
  };

  const diff = diffMatch(existing, {
    ...existing,
    homeWickets: null,
    awayWickets: null,
  });

  assert.equal(diff.changed, false);
  assert.deepEqual(diff.changes, []);
  assert.deepEqual(diff.next, {});
});

test('diffMatch records score and status changes', () => {
  const diff = diffMatch(
    {
      status: MATCH_STATUS.LIVE,
      statusText: '2nd half',
      liveMinute: '80',
      homeScore: 1,
      awayScore: 0,
      homeScoreText: '1',
      awayScoreText: '0',
      homeWickets: null,
      awayWickets: null,
      homeHtScore: 1,
      awayHtScore: 0,
      competition: 'Premier League',
      competitionSlug: 'english-premier-league',
      externalId: '12345',
      externalSlug: 'arsenal-vs-chelsea',
    },
    {
      status: MATCH_STATUS.FINISHED,
      liveMinute: null,
      homeScore: 2,
      awayScore: 1,
      homeScoreText: '2',
      awayScoreText: '1',
    },
  );

  assert.equal(diff.changed, true);
  assert.ok(diff.changes.includes('status'));
  assert.ok(diff.changes.includes('liveMinute'));
  assert.ok(diff.changes.includes('homeScore'));
  assert.equal(diff.next.status, MATCH_STATUS.FINISHED);
  assert.equal(diff.next.liveMinute, null);
  assert.equal(diff.next.homeScore, 2);
});

test('incidentMessage respects is_goal=false for disallowed goals', () => {
  const message = incidentMessage({
    incident: {
      time: 70,
      type: 'Goal disallowed',
      side: 'home',
      player: 'Player X',
      is_goal: false,
    },
    match: {
      homeTeam: 'Arsenal',
      awayTeam: 'Chelsea',
      homeScore: 1,
      awayScore: 0,
    },
  });

  assert.match(message, /^Goal disallowed:/);
  assert.doesNotMatch(message, /Goal!/);
});

test('mapIncidentsToCommentary generates idempotent football events', () => {
  const incidents = [
    {
      time: 23,
      type: 'Goal',
      side: 'home',
      player: 'Bukayo Saka',
      is_goal: true,
      home_score: 1,
      away_score: 0,
    },
    {
      time: 45,
      type: 'Substitution',
      side: 'away',
      player_in: 'Player A',
      player_out: 'Player B',
      is_sub: true,
    },
  ];

  const match = {
    id: 7,
    sport: 'football',
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    homeScore: 1,
    awayScore: 0,
  };

  const rows = mapIncidentsToCommentary({
    incidents,
    match,
    externalMatchId: '12345',
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].matchId, 7);
  assert.equal(rows[0].eventType, 'Goal');
  assert.equal(rows[0].minutes, 23);
  assert.match(rows[0].message, /Goal! Bukayo Saka scores for Arsenal/);
  assert.equal(rows[0].metadata.generated, true);
  assert.equal(rows[0].externalEventId, hashIncident({
    externalMatchId: '12345',
    incident: incidents[0],
  }));
});

test('mapIncidentsToCommentary disambiguates duplicate incidents', () => {
  const incident = {
    time: 60,
    type: 'Yellow Card',
    side: 'home',
    player: 'Player X',
  };
  const rows = mapIncidentsToCommentary({
    incidents: [incident, { ...incident }],
    match: {
      id: 1,
      sport: 'football',
      homeTeam: 'A',
      awayTeam: 'B',
    },
    externalMatchId: '999',
  });

  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].externalEventId, rows[1].externalEventId);
});

test('normalizeTeamName removes club suffixes and accents', () => {
  assert.equal(normalizeTeamName('Atlético Madrid'), 'atletico madrid');
  assert.equal(normalizeTeamName('Arsenal FC'), 'arsenal');
  assert.equal(normalizeTeamName('Brighton & Hove Albion'), 'brighton and hove albion');
});
