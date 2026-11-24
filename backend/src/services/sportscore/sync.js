import { and, eq, lt, or } from 'drizzle-orm';
import { db as defaultDb } from '../../db/db.js';
import { commentary, matches } from '../../db/schema.js';
import { MATCH_STATUS } from '../../validation/matches.js';
import { SportScoreClient } from './client.js';
import { loadSportScoreConfig } from './config.js';
import {
  SPORTSCORE_ATTRIBUTION,
  withSportScoreAttribution,
} from './attribution.js';
import {
  diffMatch,
  mapDetail,
  mapFixture,
  mapIncidentsToCommentary,
} from './mappers.js';
import { parseFixturesResponse, parseMatchResponse } from './schemas.js';

const PROVIDER = 'sportscore';

export function formatDateUTC(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function shiftDateUTC(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateUTC(date);
}

export class SportScoreSyncService {
  constructor({
    config = loadSportScoreConfig(),
    client = null,
    db = defaultDb,
    broadcast = {},
    logger = console,
    now = () => new Date(),
  } = {}) {
    this.config = config;
    this.client = client || new SportScoreClient(config);
    this.db = db;
    this.broadcast = broadcast;
    this.logger = logger;
    this.now = now;

    this.timer = null;
    this.isPolling = false;
    this.lastRun = null;
    this.lastError = null;
    this.detailLastFetched = new Map();
    this.finishedDetailFetched = new Set();
    this.externalIdCache = new Map();
    this.scopeState = new Map();
  }

  start() {
    if (!this.config.pollEnabled) {
      this.logger.info?.('[sportscore] polling disabled');
      return this;
    }
    if (this.timer) return this;

    this.logger.info?.(
      `[sportscore] starting poller every ${this.config.pollIntervalMs}ms`,
    );

    this.runOnce('startup').catch((error) => {
      this.logger.error?.('[sportscore] startup poll failed', error);
    });

    this.timer = setInterval(() => {
      this.runOnce('interval').catch((error) => {
        this.logger.error?.('[sportscore] interval poll failed', error);
      });
    }, this.config.pollIntervalMs);

    if (typeof this.timer.unref === 'function') this.timer.unref();
    return this;
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    return this;
  }

  status() {
    return {
      enabled: this.config.pollEnabled,
      running: this.isPolling,
      lastRun: this.lastRun,
      lastError: this.lastError,
      requestUsage: this.client.getUsage(),
      footballCompetitions: this.config.footballCompetitions,
      cricketCompetitions: this.config.cricketCompetitions,
      cricketGlobalDiscovery:
        this.config.cricketEnabled && this.config.cricketCompetitions.length === 0,
    };
  }

  async runOnce(reason = 'manual', { date: dateOverride = null } = {}) {
    if (this.isPolling) {
      return { skipped: true, reason: 'already-running' };
    }

    if (!this.client.budget.canRequest(1)) {
      this.logger.warn?.('[sportscore] request budget exhausted; skipping poll');
      return { skipped: true, reason: 'budget-exhausted' };
    }

    this.isPolling = true;
    const startedAt = this.now();
    const date = dateOverride || formatDateUTC(startedAt);
    const results = [];

    try {
      // Late-night fixtures can still be live after UTC midnight, so poll
      // yesterday alongside today. Live queries below make sure in-progress
      // matches are not lost when a daily feed is truncated by its limit.
      const dates = [shiftDateUTC(date, -1), date];

      for (const pollDate of dates) {
        if (this.config.footballCompetitions.length > 0) {
          for (const competition of this.config.footballCompetitions) {
            results.push(
              await this.runScope(
                `${PROVIDER}:football:${competition}:${pollDate}`,
                () => this.syncCompetition('football', competition, pollDate),
              ),
            );
          }
        } else {
          results.push(
            await this.runScope(`${PROVIDER}:football:global:${pollDate}`, () =>
              this.syncGlobal('football', pollDate),
            ),
          );
        }

        results.push(
          await this.runScope(`${PROVIDER}:football:live:${pollDate}`, () =>
            this.syncLive('football', pollDate),
          ),
        );

        if (this.config.cricketEnabled) {
          if (this.config.cricketCompetitions.length > 0) {
            for (const competition of this.config.cricketCompetitions) {
              results.push(
                await this.runScope(
                  `${PROVIDER}:cricket:${competition}:${pollDate}`,
                  () => this.syncCompetition('cricket', competition, pollDate),
                ),
              );
            }
          } else {
            results.push(
              await this.runScope(`${PROVIDER}:cricket:global:${pollDate}`, () =>
                this.syncGlobal('cricket', pollDate),
              ),
            );
          }

          results.push(
            await this.runScope(`${PROVIDER}:cricket:live:${pollDate}`, () =>
              this.syncLive('cricket', pollDate),
            ),
          );
        }
      }

      results.push(await this.reconcileLiveMatches());

      this.lastRun = {
        reason,
        startedAt: startedAt.toISOString(),
        finishedAt: this.now().toISOString(),
        date,
        results,
      };
      this.lastError = null;
      return this.lastRun;
    } catch (error) {
      this.lastError = {
        message: error?.message || String(error),
        at: this.now().toISOString(),
      };
      this.logger.error?.('[sportscore] poll failed', error);
      throw error;
    } finally {
      this.isPolling = false;
    }
  }

  async runScope(scope, fn) {
    if (this.isScopeBackedOff(scope)) {
      return { scope, skipped: true, reason: 'backoff' };
    }

    try {
      const result = await fn();
      this.recordScopeSuccess(scope);
      return { scope, ...result };
    } catch (error) {
      this.recordScopeFailure(scope, error);
      this.logger.warn?.(
        `[sportscore] ${scope} failed: ${error?.message || error}`,
      );
      return {
        scope,
        error: error?.message || String(error),
      };
    }
  }

  async syncCompetition(sport, competitionSlug, date) {
    const response = await this.client.getFixtures({
      sport,
      date,
      competition: competitionSlug,
      limit: 200,
    });
    const parsed = parseFixturesResponse(response);

    return this.processFixtures(parsed.matches, { sport, competitionSlug });
  }

  async syncGlobal(sport, date) {
    const response = await this.client.getFixtures({
      sport,
      date,
      limit: 200,
    });
    const parsed = parseFixturesResponse(response);

    return this.processFixtures(parsed.matches, { sport, competitionSlug: null });
  }

  async syncLive(sport, date) {
    const response = await this.client.getFixtures({
      sport,
      date,
      status: 'live',
      limit: 200,
    });
    const parsed = parseFixturesResponse(response);

    return this.processFixtures(parsed.matches, { sport, competitionSlug: null });
  }

  async processFixtures(fixtures, context) {
    let processed = 0;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let commentaryInserted = 0;

    for (const fixture of fixtures) {
      try {
        const result = await this.processFixture(fixture, context);
        processed += 1;
        if (result.created) created += 1;
        if (result.updated) updated += 1;
        if (result.skipped) skipped += 1;
        if (result.commentaryInserted) commentaryInserted += result.commentaryInserted;
      } catch (error) {
        skipped += 1;
        this.logger.warn?.(
          `[sportscore] failed to process ${fixture?.home} vs ${fixture?.away}: ${
            error?.message || error
          }`,
        );
      }
    }

    return {
      processed,
      created,
      updated,
      skipped,
      commentaryInserted,
    };
  }

  async processFixture(fixture, { sport, competitionSlug }) {
    const mapped = mapFixture(fixture, { sport, competitionSlug });
    if (!mapped.externalSlug) {
      return { skipped: 'missing-slug' };
    }

    let existing = await this.findLinkedMatch(mapped);

    if (!existing) {
      if (!this.config.autoImport) {
        return { skipped: 'unlinked' };
      }
      if (!this.shouldAutoImport(mapped)) {
        return { skipped: 'outside-import-window' };
      }

      if (sport === 'cricket' && !mapped.externalId) {
        mapped.externalId = await this.resolveExternalId(
          'cricket',
          mapped.externalSlug,
        );
      }
      if (sport === 'cricket' && !mapped.externalId) {
        return { skipped: 'missing-external-id' };
      }

      existing = await this.importMatch(mapped);
      if (!existing) return { skipped: 'import-failed' };
    }

    const created = existing.__created === true;
    const wasLive = existing.status === MATCH_STATUS.LIVE;
    const updated = await this.applyMatchUpdate(existing, mapped);

    let detailResult = null;
    const justFinished =
      mapped.status === MATCH_STATUS.FINISHED && wasLive;
    const finishedDetailKey = updated.externalSlug || String(updated.id);
    const needsFinishedDetail =
      sport === 'football' &&
      updated.status === MATCH_STATUS.FINISHED &&
      !this.finishedDetailFetched.has(finishedDetailKey);

    if (
      sport === 'football' &&
      (updated.status === MATCH_STATUS.LIVE || justFinished || needsFinishedDetail)
    ) {
      detailResult = await this.syncDetail(updated, {
        force: justFinished || needsFinishedDetail,
      });
      if (needsFinishedDetail && detailResult) {
        this.finishedDetailFetched.add(finishedDetailKey);
      }
    } else if (sport === 'cricket' && !updated.externalId) {
      const externalId = await this.resolveExternalId(
        'cricket',
        updated.externalSlug,
      );
      if (externalId) {
        const linked = await this.applyMatchUpdate(updated, {
          ...mapped,
          externalId,
        });
        detailResult = { match: linked, inserted: 0, changed: false };
      }
    }

    return {
      matchId: detailResult?.match?.id || updated.id,
      created,
      updated: updated.__updated === true || Boolean(detailResult?.changed),
      commentaryInserted: detailResult?.inserted || 0,
    };
  }

  shouldAutoImport(mapped) {
    if (mapped.status === MATCH_STATUS.LIVE) return true;
    if (!mapped.startTime) return false;

    const windowMs = this.config.autoImportWindowHours * 60 * 60 * 1000;
    const nowMs = this.now().getTime();
    const startMs = mapped.startTime.getTime();

    if (mapped.status === MATCH_STATUS.SCHEDULED) {
      return startMs >= nowMs - windowMs && startMs <= nowMs + windowMs;
    }

    if (mapped.status === MATCH_STATUS.FINISHED) {
      // Recently finished matches are imported once so their incidents can
      // become commentary, even when no live football is available.
      return startMs >= nowMs - windowMs && startMs <= nowMs;
    }

    return false;
  }

  async findLinkedMatch(mapped) {
    const clauses = [];

    if (mapped.externalId) {
      clauses.push(
        and(
          eq(matches.externalSource, PROVIDER),
          eq(matches.externalId, mapped.externalId),
        ),
      );
    }

    if (mapped.externalSlug) {
      clauses.push(
        and(
          eq(matches.externalSource, PROVIDER),
          eq(matches.externalSlug, mapped.externalSlug),
        ),
      );
    }

    if (clauses.length === 0) return null;

    const rows = await this.db
      .select()
      .from(matches)
      .where(clauses.length === 1 ? clauses[0] : or(...clauses))
      .limit(2);

    if (rows.length > 1) {
      this.logger.warn?.(
        `[sportscore] multiple internal matches match ${mapped.externalSlug}; using id ${rows[0].id}`,
      );
    }

    return rows[0] || null;
  }

  async importMatch(mapped) {
    const now = this.now();
    const [inserted] = await this.db
      .insert(matches)
      .values({
        sport: mapped.sport,
        homeTeam: mapped.homeTeam,
        awayTeam: mapped.awayTeam,
        status: mapped.status || MATCH_STATUS.SCHEDULED,
        startTime: mapped.startTime,
        endTime: null,
        homeScore: mapped.homeScore ?? 0,
        awayScore: mapped.awayScore ?? 0,
        externalSource: PROVIDER,
        externalId: mapped.externalId ?? null,
        externalSlug: mapped.externalSlug ?? null,
        competition: mapped.competition ?? null,
        competitionSlug: mapped.competitionSlug ?? null,
        statusText: mapped.statusText ?? null,
        liveMinute: mapped.liveMinute ?? null,
        homeScoreText: mapped.homeScoreText ?? null,
        awayScoreText: mapped.awayScoreText ?? null,
        homeWickets: mapped.homeWickets ?? null,
        awayWickets: mapped.awayWickets ?? null,
        homeHtScore: mapped.homeHtScore ?? null,
        awayHtScore: mapped.awayHtScore ?? null,
        lastSyncedAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [matches.externalSource, matches.externalId],
      })
      .returning();

    if (!inserted) {
      return this.findLinkedMatch(mapped);
    }

    this.safeBroadcast('matchCreated', withSportScoreAttribution(inserted));
    return { ...inserted, __created: true };
  }

  async applyMatchUpdate(existing, incoming) {
    const now = this.now();
    const diff = diffMatch(existing, incoming);
    const values = {
      ...diff.next,
      lastSyncedAt: now,
    };
    if (diff.changed) values.updatedAt = now;

    const [updated] = await this.db
      .update(matches)
      .set(values)
      .where(eq(matches.id, existing.id))
      .returning();

    const row = updated || existing;

    if (diff.changed) {
      this.safeBroadcast('matchUpdated', row.id, {
        data: withSportScoreAttribution(row),
        changes: diff.changes,
        source: PROVIDER,
      });
    }

    return { ...row, __updated: diff.changed };
  }

  async syncDetail(match, { force = false } = {}) {
    if (!match.externalSlug) return null;

    const sport = String(match.sport || '').toLowerCase();
    const now = this.now();
    const lastFetched = this.detailLastFetched.get(match.id) || 0;
    if (!force && now.getTime() - lastFetched < this.config.detailPollIntervalMs) {
      return null;
    }
    this.detailLastFetched.set(match.id, now.getTime());

    const response = await this.client.getMatch({
      sport,
      slug: match.externalSlug,
    });
    const parsed = parseMatchResponse(response);
    const detail = mapDetail(parsed.match, { sport });

    const diff = diffMatch(match, detail);
    const externalMatchId =
      match.externalId || detail.externalId || String(match.id);

    const transactionResult = await this.db.transaction(async (tx) => {
      const values = {
        ...diff.next,
        lastSyncedAt: now,
      };
      if (diff.changed) values.updatedAt = now;

      const [updated] = await tx
        .update(matches)
        .set(values)
        .where(eq(matches.id, match.id))
        .returning();

      const row = updated || match;
      let insertedCommentary = [];

      if (sport === 'football' && detail.incidents.length > 0) {
        const rows = mapIncidentsToCommentary({
          incidents: detail.incidents,
          match: { ...row, sport },
          externalMatchId,
          ingestSubstitutions: this.config.ingestSubstitutions,
        });

        if (rows.length > 0) {
          insertedCommentary = await tx
            .insert(commentary)
            .values(rows)
            .onConflictDoNothing({
              target: [commentary.matchId, commentary.externalEventId],
            })
            .returning();
        }
      }

      return { row, insertedCommentary };
    });

    if (diff.changed) {
      this.safeBroadcast('matchUpdated', transactionResult.row.id, {
        data: withSportScoreAttribution(transactionResult.row),
        changes: diff.changes,
        source: PROVIDER,
      });
    }

    for (const item of transactionResult.insertedCommentary) {
      this.safeBroadcast('commentary', item.matchId, {
        ...item,
        attribution: SPORTSCORE_ATTRIBUTION,
      });
    }

    return {
      match: transactionResult.row,
      inserted: transactionResult.insertedCommentary.length,
      changed: diff.changed,
    };
  }

  async resolveExternalId(sport, slug) {
    if (!slug) return null;
    const cacheKey = `${sport}:${slug}`;
    if (this.externalIdCache.has(cacheKey)) {
      return this.externalIdCache.get(cacheKey);
    }

    try {
      const response = await this.client.getMatch({ sport, slug });
      const parsed = parseMatchResponse(response);
      const externalId = parsed.match?.tracker?.id || null;
      this.externalIdCache.set(cacheKey, externalId);
      return externalId;
    } catch (error) {
      this.logger.warn?.(
        `[sportscore] could not resolve external id for ${slug}: ${
          error?.message || error
        }`,
      );
      return null;
    }
  }

  async reconcileLiveMatches() {
    if (this.config.reconcileLimit <= 0) {
      return { scope: `${PROVIDER}:reconcile`, processed: 0, updated: 0 };
    }

    const cutoff = new Date(
      this.now().getTime() - this.config.pollIntervalMs * 2,
    );

    const rows = await this.db
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.externalSource, PROVIDER),
          eq(matches.status, MATCH_STATUS.LIVE),
          lt(matches.lastSyncedAt, cutoff),
        ),
      )
      .limit(this.config.reconcileLimit);

    let processed = 0;
    let updated = 0;

    for (const row of rows) {
      try {
        const result = await this.syncDetail(row, { force: true });
        processed += 1;
        if (result?.changed) updated += 1;
      } catch (error) {
        this.logger.warn?.(
          `[sportscore] reconcile failed for match ${row.id}: ${
            error?.message || error
          }`,
        );
      }
    }

    return { scope: `${PROVIDER}:reconcile`, processed, updated };
  }

  safeBroadcast(name, ...args) {
    const fn = this.broadcast?.[name];
    if (typeof fn !== 'function') return;
    try {
      fn(...args);
    } catch (error) {
      this.logger.warn?.(`[sportscore] broadcast ${name} failed`, error);
    }
  }

  isScopeBackedOff(scope) {
    const state = this.scopeState.get(scope);
    return Boolean(state && state.nextAttemptAt > this.now().getTime());
  }

  recordScopeSuccess(scope) {
    this.scopeState.delete(scope);
  }

  recordScopeFailure(scope, error) {
    const previous = this.scopeState.get(scope);
    const failures = (previous?.failures || 0) + 1;
    const delay = Math.min(300_000, 30_000 * 2 ** (failures - 1));
    this.scopeState.set(scope, {
      failures,
      nextAttemptAt: this.now().getTime() + delay,
      lastError: error?.message || String(error),
    });
  }
}

export function startSportScorePoller({
  config = loadSportScoreConfig(),
  client = null,
  db = defaultDb,
  broadcast = {},
  logger = console,
} = {}) {
  const service = new SportScoreSyncService({
    config,
    client,
    db,
    broadcast,
    logger,
  });
  service.start();
  return service;
}
