import { z } from 'zod';
import { SportScoreError } from './client.js';

const scoreValueSchema = z.union([z.string(), z.number()]).nullable().optional();
const numericValueSchema = z.union([z.string(), z.number()]).nullish();

const matchBaseShape = {
  home: z.string(),
  away: z.string(),
  home_logo: z.string().nullish(),
  away_logo: z.string().nullish(),
  home_score: scoreValueSchema,
  away_score: scoreValueSchema,
  status: z.string(),
  status_text: z.string().nullish(),
  time: z.string().nullish(),
  competition: z.string().nullish(),
  competition_logo: z.string().nullish(),
  url: z.string(),
};

export const fixtureSchema = z.object(matchBaseShape).catchall(z.unknown());

export const fixturesResponseSchema = z.object({
  sport: z.string(),
  date: z.string().optional(),
  count: z.number().optional(),
  matches: z.array(fixtureSchema),
  updated: z.string().optional(),
});

export const incidentSchema = z
  .object({
    time: z.number().nullish(),
    type: z.string().nullish(),
    type_id: z.number().nullish(),
    side: z.string().nullish(),
    player: z.string().nullish(),
    is_sub: z.boolean().nullish(),
    player_in: z.string().nullish(),
    player_out: z.string().nullish(),
    is_card: z.boolean().nullish(),
    is_goal: z.boolean().nullish(),
    home_score: z.number().nullish(),
    away_score: z.number().nullish(),
  })
  .catchall(z.unknown());

export const statSchema = z
  .object({
    label: z.string().nullish(),
    home: numericValueSchema,
    away: numericValueSchema,
    home_pct: numericValueSchema,
    away_pct: numericValueSchema,
    suffix: z.string().nullish(),
  })
  .catchall(z.unknown());

export const lineupPlayerSchema = z
  .object({
    name: z.string().nullish(),
    number: z.number().nullish(),
    position: z.string().nullish(),
    captain: z.boolean().nullish(),
    rating: z.union([z.string(), z.number()]).nullish(),
  })
  .catchall(z.unknown());

export const lineupsSchema = z
  .object({
    home_formation: z.string().nullish(),
    away_formation: z.string().nullish(),
    home_coach: z.string().nullish(),
    away_coach: z.string().nullish(),
    confirmed: z.boolean().nullish(),
    home_xi: z.array(lineupPlayerSchema).default([]),
    away_xi: z.array(lineupPlayerSchema).default([]),
    home_subs: z.array(lineupPlayerSchema).default([]),
    away_subs: z.array(lineupPlayerSchema).default([]),
  })
  .catchall(z.unknown())
  .nullish();

export const trackerSchema = z
  .object({
    id: z.string(),
    profile: z.string().nullish(),
    sport: z.string().nullish(),
  })
  .catchall(z.unknown())
  .nullish();

export const matchDetailSchema = z
  .object({
    ...matchBaseShape,
    live_minute: z.union([z.string(), z.number()]).nullish(),
    incidents: z.array(incidentSchema).default([]),
    stats: z.array(statSchema).default([]),
    lineups: lineupsSchema.default(null),
    home_ht_score: numericValueSchema,
    away_ht_score: numericValueSchema,
    tracker: trackerSchema,
  })
  .catchall(z.unknown());

export const matchResponseSchema = z.object({
  sport: z.string(),
  match: matchDetailSchema,
  updated: z.string().optional(),
});

function parseOrThrow(schema, body, label) {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new SportScoreError(`Invalid SportScore ${label} response`, {
      code: 'SPORTSCORE_INVALID_RESPONSE',
      body: result.error.issues,
    });
  }
  return result.data;
}

export function parseFixturesResponse(body) {
  return parseOrThrow(fixturesResponseSchema, body, 'fixtures');
}

export function parseMatchResponse(body) {
  return parseOrThrow(matchResponseSchema, body, 'match detail');
}
