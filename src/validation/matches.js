import { z } from "zod";

export const MATCH_STATUS = {
  SCHEDULED: "scheduled",
  LIVE: "live",
  FINISHED: "finished",
};

export const listMatchesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const matchIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const isoDateTime = z.iso.datetime({ offset: true });

export const createMatchSchema = z
  .object({
    sport: z.string().trim().min(1, "sport is required"),
    homeTeam: z.string().trim().min(1, "homeTeam is required"),
    awayTeam: z.string().trim().min(1, "awayTeam is required"),
    startTime: isoDateTime,
    endTime: isoDateTime,
    homeScore: z.coerce.number().int().nonnegative().optional(),
    awayScore: z.coerce.number().int().nonnegative().optional(),
  })
  .superRefine((data, ctx) => {
    const start = Date.parse(data.startTime);
    const end = Date.parse(data.endTime);

    if (Number.isNaN(start) || Number.isNaN(end)) {
      return;
    }

    if (end <= start) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "endTime must be after startTime",
      });
    }
  });

export const updateScoreSchema = z.object({
  homeScore: z.coerce.number().int().nonnegative(),
  awayScore: z.coerce.number().int().nonnegative(),
});
