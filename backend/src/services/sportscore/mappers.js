import { createHash } from 'node:crypto';
import { MATCH_STATUS } from '../../validation/matches.js';

export function mapStatus(status) {
  switch (String(status || '').toLowerCase()) {
    case 'scheduled':
    case 'upcoming':
    case 'notstarted':
    case 'not_started':
      return MATCH_STATUS.SCHEDULED;
    case 'live':
    case 'inprogress':
    case 'in_progress':
      return MATCH_STATUS.LIVE;
    case 'finished':
    case 'ended':
    case 'fulltime':
    case 'full_time':
      return MATCH_STATUS.FINISHED;
    default:
      return null;
  }
}

export function toInteger(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.trunc(value) : null;
  }
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

export function toScoreText(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

export function parseCricketScore(value) {
  if (value === undefined || value === null || value === '') {
    return { runs: null, wickets: null, text: null };
  }

  if (typeof value === 'number') {
    return {
      runs: Number.isFinite(value) ? Math.trunc(value) : null,
      wickets: null,
      text: String(value),
    };
  }

  const text = String(value).trim();
  if (!text || text === '-') {
    return { runs: null, wickets: null, text: text || null };
  }

  const match = text.match(/^(\d+)(?:\/(\d+))?/);
  if (!match) {
    return { runs: null, wickets: null, text };
  }

  return {
    runs: Number(match[1]),
    wickets: match[2] === undefined ? null : Number(match[2]),
    text,
  };
}

function pathParts(url) {
  if (!url) return [];
  try {
    const parsed = new URL(url, 'https://sportscore.com');
    return parsed.pathname.split('/').filter(Boolean);
  } catch {
    return String(url).split('/').filter(Boolean);
  }
}

export function extractMatchSlug(url) {
  const parts = pathParts(url);
  const last = parts.at(-1) || null;
  const previous = parts.at(-2) || null;

  if (last?.includes('-vs-')) return last;
  if (previous?.includes('-vs-')) return previous;
  return last;
}

export function extractFootballExternalId(url) {
  const parts = pathParts(url);
  const last = parts.at(-1) || null;
  if (!last || last.includes('-vs-')) return null;
  return last;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapScores(sport, homeValue, awayValue) {
  if (sport === 'cricket') {
    const home = parseCricketScore(homeValue);
    const away = parseCricketScore(awayValue);
    return {
      homeScore: home.runs,
      awayScore: away.runs,
      homeWickets: home.wickets,
      awayWickets: away.wickets,
      homeScoreText: home.text,
      awayScoreText: away.text,
    };
  }

  return {
    homeScore: toInteger(homeValue),
    awayScore: toInteger(awayValue),
    homeWickets: null,
    awayWickets: null,
    homeScoreText: toScoreText(homeValue),
    awayScoreText: toScoreText(awayValue),
  };
}

export function mapFixture(fixture, { sport, competitionSlug = null } = {}) {
  const scores = mapScores(sport, fixture.home_score, fixture.away_score);

  return {
    sport,
    homeTeam: fixture.home,
    awayTeam: fixture.away,
    status: mapStatus(fixture.status),
    statusText: fixture.status_text ?? null,
    startTime: parseDate(fixture.time),
    competition: fixture.competition ?? null,
    competitionSlug,
    externalSource: 'sportscore',
    externalId:
      sport === 'football' ? extractFootballExternalId(fixture.url) : null,
    externalSlug: extractMatchSlug(fixture.url),
    liveMinute: null,
    homeHtScore: null,
    awayHtScore: null,
    ...scores,
  };
}

export function mapDetail(detail, { sport } = {}) {
  const scores = mapScores(sport, detail.home_score, detail.away_score);

  return {
    sport,
    homeTeam: detail.home,
    awayTeam: detail.away,
    status: mapStatus(detail.status),
    statusText: detail.status_text ?? null,
    startTime: parseDate(detail.time),
    competition: detail.competition ?? null,
    externalSource: 'sportscore',
    externalId: detail.tracker?.id ?? null,
    externalSlug: extractMatchSlug(detail.url),
    liveMinute:
      detail.live_minute === undefined || detail.live_minute === null
        ? null
        : String(detail.live_minute),
    homeHtScore: toInteger(detail.home_ht_score),
    awayHtScore: toInteger(detail.away_ht_score),
    incidents: detail.incidents ?? [],
    stats: detail.stats ?? [],
    lineups: detail.lineups ?? null,
    tracker: detail.tracker ?? null,
    ...scores,
  };
}

function assignKnown(existing, target, changes, field, value) {
  if (value === undefined || value === null) return;
  if (existing[field] === value) return;
  target[field] = value;
  changes.push(field);
}

function assignScore(existing, target, changes, field, value, scoreKnown) {
  if (!scoreKnown) return;
  assignKnown(existing, target, changes, field, value);
}

export function diffMatch(existing, incoming) {
  const next = {};
  const changes = [];

  if (incoming.status && incoming.status !== existing.status) {
    next.status = incoming.status;
    changes.push('status');
  }

  if (
    incoming.statusText !== undefined &&
    incoming.statusText !== null &&
    incoming.statusText !== existing.statusText
  ) {
    next.statusText = incoming.statusText;
    changes.push('statusText');
  }

  if (incoming.liveMinute !== undefined) {
    if (
      incoming.liveMinute !== null &&
      incoming.liveMinute !== existing.liveMinute
    ) {
      next.liveMinute = incoming.liveMinute;
      changes.push('liveMinute');
    } else if (
      incoming.liveMinute === null &&
      incoming.status === MATCH_STATUS.FINISHED &&
      existing.liveMinute !== null
    ) {
      next.liveMinute = null;
      changes.push('liveMinute');
    }
  }

  const homeKnown = incoming.homeScore !== undefined && incoming.homeScore !== null;
  const awayKnown = incoming.awayScore !== undefined && incoming.awayScore !== null;

  assignScore(existing, next, changes, 'homeScore', incoming.homeScore, homeKnown);
  assignScore(existing, next, changes, 'awayScore', incoming.awayScore, awayKnown);
  assignScore(existing, next, changes, 'homeWickets', incoming.homeWickets, homeKnown);
  assignScore(existing, next, changes, 'awayWickets', incoming.awayWickets, awayKnown);
  assignScore(
    existing,
    next,
    changes,
    'homeScoreText',
    incoming.homeScoreText,
    homeKnown && incoming.homeScoreText !== null,
  );
  assignScore(
    existing,
    next,
    changes,
    'awayScoreText',
    incoming.awayScoreText,
    awayKnown && incoming.awayScoreText !== null,
  );

  assignKnown(existing, next, changes, 'homeHtScore', incoming.homeHtScore);
  assignKnown(existing, next, changes, 'awayHtScore', incoming.awayHtScore);
  assignKnown(existing, next, changes, 'competition', incoming.competition);
  assignKnown(existing, next, changes, 'competitionSlug', incoming.competitionSlug);

  if (
    incoming.externalId &&
    existing.externalId !== incoming.externalId
  ) {
    if (!existing.externalId) {
      next.externalId = incoming.externalId;
      changes.push('externalId');
    }
  }

  if (
    incoming.externalSlug &&
    existing.externalSlug !== incoming.externalSlug &&
    !existing.externalSlug
  ) {
    next.externalSlug = incoming.externalSlug;
    changes.push('externalSlug');
  }

  return {
    changed: changes.length > 0,
    changes,
    next,
  };
}

export function normalizeTeamName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\b(fc|cf|sc|afc|ac|club|football|soccer)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hashIncident({ externalMatchId, incident }) {
  const payload = [
    externalMatchId,
    incident.time ?? '',
    incident.type_id ?? incident.type ?? '',
    incident.side ?? '',
    incident.player ?? '',
    incident.player_in ?? '',
    incident.player_out ?? '',
    incident.home_score ?? '',
    incident.away_score ?? '',
  ].join('|');

  return createHash('sha256').update(payload).digest('hex');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function derivePeriod(minutes) {
  if (minutes === null || minutes === undefined) return null;
  if (minutes <= 45) return '1st half';
  if (minutes <= 90) return '2nd half';
  return 'extra time';
}

export function incidentMessage({ incident, match }) {
  const type = String(incident.type || 'Event');
  const lowerType = type.toLowerCase();
  const isGoal =
    incident.is_goal === true ||
    (incident.is_goal == null && lowerType === 'goal');
  const isSub =
    incident.is_sub === true || lowerType.includes('substitution');
  const team =
    incident.side === 'home'
      ? match.homeTeam
      : incident.side === 'away'
        ? match.awayTeam
        : null;
  const actor = incident.player || incident.player_in || null;
  const homeScore = incident.home_score ?? match.homeScore ?? 0;
  const awayScore = incident.away_score ?? match.awayScore ?? 0;
  const scoreLine = `${match.homeTeam} ${homeScore}-${awayScore} ${match.awayTeam}.`;

  if (lowerType.includes('own goal')) {
    return `Own goal by ${actor || 'a player'}${team ? ` (${team})` : ''}. ${scoreLine}`;
  }

  if (isGoal) {
    return `Goal! ${actor || 'A player'} scores${team ? ` for ${team}` : ''}. ${scoreLine}`;
  }

  if (lowerType.includes('yellow')) {
    return `Yellow card: ${actor || 'a player'}${team ? ` (${team})` : ''}.`;
  }

  if (lowerType.includes('red')) {
    return `Red card: ${actor || 'a player'}${team ? ` (${team})` : ''}.`;
  }

  if (isSub) {
    const playerIn = incident.player_in || actor || 'a player';
    const playerOut = incident.player_out || 'a player';
    return `Substitution${team ? ` (${team})` : ''}: ${playerIn} replaces ${playerOut}.`;
  }

  if (lowerType === 'var' || lowerType.includes('var')) {
    return `VAR review${team ? ` (${team})` : ''}${actor ? `: ${actor}` : ''}.`;
  }

  return `${type}: ${actor || 'event'}${team ? ` (${team})` : ''}.`;
}

export function mapIncidentToCommentary({
  incident,
  match,
  externalMatchId,
  ordinal,
  ingestSubstitutions = false,
  seenHashes = new Map(),
}) {
  const type = incident?.type;
  if (!type) return null;

  const isSubstitution =
    incident.is_sub === true ||
    String(type).toLowerCase().includes('substitution');
  if (!ingestSubstitutions && isSubstitution) {
    return null;
  }

  const baseId = hashIncident({ externalMatchId, incident });
  const seen = seenHashes.get(baseId) ?? 0;
  seenHashes.set(baseId, seen + 1);
  const externalEventId = seen === 0 ? baseId : `${baseId}#${seen}`;

  const minutes = Number.isFinite(incident.time) ? incident.time : null;
  const sequence =
    minutes === null ? ordinal : minutes * 100 + Math.min(ordinal, 99);
  const team =
    incident.side === 'home'
      ? match.homeTeam
      : incident.side === 'away'
        ? match.awayTeam
        : null;

  return {
    matchId: match.id,
    minutes,
    sequence,
    period: derivePeriod(minutes),
    eventType: type,
    actor: incident.player || incident.player_in || null,
    team,
    message: incidentMessage({ incident, match }),
    metadata: {
      provider: 'sportscore',
      externalMatchId,
      generated: true,
      periodDerived: minutes !== null,
      incident,
    },
    tags: ['sportscore', match.sport, slugify(type)].filter(Boolean),
    externalEventId,
    source: 'sportscore',
  };
}

export function mapIncidentsToCommentary({
  incidents,
  match,
  externalMatchId,
  ingestSubstitutions = false,
}) {
  const seenHashes = new Map();
  const rows = [];

  incidents.forEach((incident, index) => {
    const row = mapIncidentToCommentary({
      incident,
      match,
      externalMatchId,
      ordinal: index,
      ingestSubstitutions,
      seenHashes,
    });
    if (row) rows.push(row);
  });

  return rows;
}
