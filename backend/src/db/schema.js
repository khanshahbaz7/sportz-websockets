import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  pgEnum,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

export const matchStatusEnum = pgEnum('match_status', ['scheduled', 'live', 'finished']);

export const matches = pgTable(
  'matches',
  {
    id: serial('id').primaryKey(),
    sport: text('sport').notNull(),
    homeTeam: text('home_team').notNull(),
    awayTeam: text('away_team').notNull(),
    status: matchStatusEnum('status').notNull().default('scheduled'),
    startTime: timestamp('start_time'),
    endTime: timestamp('end_time'),
    homeScore: integer('home_score').notNull().default(0),
    awayScore: integer('away_score').notNull().default(0),

    // External provider linkage and display state.
    externalSource: text('external_source'),
    externalId: text('external_id'),
    externalSlug: text('external_slug'),
    competition: text('competition'),
    competitionSlug: text('competition_slug'),
    statusText: text('status_text'),
    liveMinute: text('live_minute'),
    homeScoreText: text('home_score_text'),
    awayScoreText: text('away_score_text'),
    homeWickets: integer('home_wickets'),
    awayWickets: integer('away_wickets'),
    homeHtScore: integer('home_ht_score'),
    awayHtScore: integer('away_ht_score'),
    lastSyncedAt: timestamp('last_synced_at'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('matches_external_source_external_id_idx').on(
      table.externalSource,
      table.externalId,
    ),
    index('matches_status_start_time_idx').on(table.status, table.startTime),
  ],
);

export const commentary = pgTable(
  'commentary',
  {
    id: serial('id').primaryKey(),
    matchId: integer('match_id')
      .notNull()
      .references(() => matches.id),
    minutes: integer('minutes'),
    sequence: integer('sequence'),
    period: text('period'),
    eventType: text('event_type'),
    actor: text('actor'),
    team: text('team'),
    message: text('message').notNull(),
    metadata: jsonb('metadata'),
    tags: text('tags').array(),

    // Provider event identity used to make ingestion idempotent.
    externalEventId: text('external_event_id'),
    source: text('source'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('commentary_match_external_event_idx').on(
      table.matchId,
      table.externalEventId,
    ),
    index('commentary_match_created_idx').on(table.matchId, table.createdAt),
  ],
);