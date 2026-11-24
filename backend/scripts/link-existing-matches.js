import 'dotenv/config';
import { and, eq, isNull, or } from 'drizzle-orm';
import { db, pool } from '../src/db/db.js';
import { matches } from '../src/db/schema.js';
import { loadSportScoreConfig } from '../src/services/sportscore/config.js';
import { SportScoreClient } from '../src/services/sportscore/client.js';
import {
  mapFixture,
  normalizeTeamName,
} from '../src/services/sportscore/mappers.js';
import {
  parseFixturesResponse,
  parseMatchResponse,
} from '../src/services/sportscore/schemas.js';

function getArg(name) {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : null;
}

function hasFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

function formatDateUTC(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function dateForMatch(match) {
  if (!match.startTime) return formatDateUTC();
  const date = new Date(match.startTime);
  return Number.isNaN(date.getTime()) ? formatDateUTC() : formatDateUTC(date);
}

function fixtureCacheKey({ sport, competition, date }) {
  return `${sport}:${competition || 'global'}:${date}`;
}

const config = loadSportScoreConfig();
const client = new SportScoreClient(config);
const dryRun = hasFlag('dry-run');

async function resolveExternalId(sport, slug) {
  const response = await client.getMatch({ sport, slug });
  const parsed = parseMatchResponse(response);
  return parsed.match?.tracker?.id || null;
}

async function linkMatch(match, fixture, { competitionSlug = null } = {}) {
  const sport = String(match.sport || '').toLowerCase();
  const mapped = mapFixture(fixture, {
    sport,
    competitionSlug,
  });

  let externalId = mapped.externalId;
  if (!externalId) {
    externalId = await resolveExternalId(sport, mapped.externalSlug);
  }

  if (!externalId) {
    throw new Error(`could not resolve an external id for ${mapped.externalSlug}`);
  }

  const values = {
    externalSource: 'sportscore',
    externalId,
    externalSlug: mapped.externalSlug,
    competition: mapped.competition,
    competitionSlug: mapped.competitionSlug,
    updatedAt: new Date(),
  };

  if (!dryRun) {
    await db.update(matches).set(values).where(eq(matches.id, match.id));
  }

  return values;
}

async function linkById(matchId, slug) {
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!match) {
    throw new Error(`match ${matchId} not found`);
  }

  const response = await client.getMatch({ sport: String(match.sport || '').toLowerCase(), slug });
  const parsed = parseMatchResponse(response);
  const detail = parsed.match;
  const externalId = detail.tracker?.id;

  if (!externalId) {
    throw new Error(`SportScore did not return a tracker id for ${slug}`);
  }

  const values = {
    externalSource: 'sportscore',
    externalId,
    externalSlug: slug,
    competition: detail.competition ?? null,
    competitionSlug: null,
    updatedAt: new Date(),
  };

  if (!dryRun) {
    await db.update(matches).set(values).where(eq(matches.id, match.id));
  }

  return { match, values };
}

async function loadFixtures({ sport, competition, date }) {
  const response = await client.getFixtures({
    sport,
    date,
    competition: competition || undefined,
    limit: 200,
  });
  return parseFixturesResponse(response).matches;
}

function findFixture(fixtures, match) {
  const home = normalizeTeamName(match.homeTeam);
  const away = normalizeTeamName(match.awayTeam);

  return fixtures.find(
    (fixture) =>
      normalizeTeamName(fixture.home) === home &&
      normalizeTeamName(fixture.away) === away,
  );
}

async function autoLink() {
  const rows = await db
    .select()
    .from(matches)
    .where(
      or(
        isNull(matches.externalSource),
        and(
          eq(matches.externalSource, 'sportscore'),
          isNull(matches.externalId),
        ),
      ),
    );

  if (rows.length === 0) {
    console.log('No unlinked matches found.');
    return { linked: 0, skipped: 0, failed: 0 };
  }

  const cache = new Map();
  const summary = { linked: 0, skipped: 0, failed: 0 };

  for (const match of rows) {
    const sport = String(match.sport || '').toLowerCase();
    if (!['football', 'cricket'].includes(sport)) {
      console.warn(`- match ${match.id}: unsupported sport "${match.sport}"`);
      summary.skipped += 1;
      continue;
    }

    const date = dateForMatch(match);
    const competitions =
      sport === 'football'
        ? config.footballCompetitions
        : config.cricketCompetitions;
    const scopes = competitions.length > 0 ? competitions : [null];

    try {
      let fixture = null;
      let competitionSlug = null;

      for (const competition of scopes) {
        const key = fixtureCacheKey({ sport, competition, date });
        if (!cache.has(key)) {
          cache.set(key, await loadFixtures({ sport, competition, date }));
        }

        fixture = findFixture(cache.get(key), match);
        if (fixture) {
          competitionSlug = competition;
          break;
        }
      }

      if (!fixture) {
        console.warn(`- match ${match.id}: no SportScore fixture found (${date})`);
        summary.skipped += 1;
        continue;
      }

      const values = await linkMatch(match, fixture, { competitionSlug });
      console.log(
        `- match ${match.id}: linked to ${values.externalSlug} (${values.externalId})${dryRun ? ' [dry run]' : ''}`,
      );
      summary.linked += 1;
    } catch (error) {
      console.error(`- match ${match.id}: failed: ${error?.message || error}`);
      summary.failed += 1;
    }
  }

  return summary;
}

const manualId = getArg('id');
const manualSlug = getArg('slug');

try {
  let summary;

  if (manualId || manualSlug) {
    if (!manualId || !manualSlug) {
      throw new Error('manual linking requires both --id and --slug');
    }
    const { match, values } = await linkById(Number(manualId), manualSlug);
    console.log(
      `Linked match ${match.id} to ${values.externalSlug} (${values.externalId})${dryRun ? ' [dry run]' : ''}`,
    );
    summary = { linked: 1, skipped: 0, failed: 0 };
  } else {
    summary = await autoLink();
  }

  console.log(
    `Done: ${summary.linked} linked, ${summary.skipped} skipped, ${summary.failed} failed.`,
  );
} catch (error) {
  console.error('Link failed:', error?.message || error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
