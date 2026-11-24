import { Router } from "express";
import {
  createMatchSchema,
  linkMatchSchema,
  listMatchesQuerySchema,
  matchIdParamSchema,
} from "../validation/matches.js";
import { db } from "../db/db.js";
import { matches } from "../db/schema.js";
import { getMatchStatus } from "../utils/math-status.js";
import { withSportScoreAttribution } from "../services/sportscore/attribution.js";
import { desc, eq, sql } from "drizzle-orm";

export const matchRouter = Router();

const MAX_LIMIT = 100;

matchRouter.get("/", async (req, res) => {
    const parsed = listMatchesQuerySchema.safeParse(req.query);

    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid Query", details: parsed.error.issues });
    }

    const limit = Math.min(parsed.data.limit ?? 50, MAX_LIMIT)

    try {
        const data = await db
            .select()
            .from(matches)
            .orderBy(
                sql`case ${matches.status} when 'live' then 0 when 'scheduled' then 1 else 2 end`,
                desc(matches.createdAt),
            )
            .limit(limit);

        return res.json({ data: data.map(withSportScoreAttribution) });
    } catch (e) {
        console.error("Failed to list matches:", e);
        return res.status(500).json({ error: "Failed to list matches." })
    }
})

matchRouter.get("/:id", async (req, res) => {
    const parsed = matchIdParamSchema.safeParse(req.params);

    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid match ID.", details: parsed.error.issues });
    }

    try {
        const [match] = await db
            .select()
            .from(matches)
            .where(eq(matches.id, parsed.data.id))
            .limit(1);

        if (!match) {
            return res.status(404).json({ error: "Match not found." });
        }

        return res.json({ data: withSportScoreAttribution(match) });
    } catch (e) {
        console.error("Failed to get match:", e);
        return res.status(500).json({ error: "Failed to get match." })
    }
})

matchRouter.post("/", async (req, res) => {
    const parsed = createMatchSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid Payload.", details: parsed.error.issues})
    }

    const { data: { startTime, endTime, homeScore, awayScore } } = parsed;

    try {
        const [event] = await db.insert(matches).values({
            ...parsed.data,
            startTime: new Date(startTime),
            endTime: new Date(endTime),
            homeScore: homeScore ?? 0,
            awayScore: awayScore ?? 0,
            status: getMatchStatus(startTime, endTime)
        }).returning();

        if(res.app.locals.broadcastMatchCreated){
            res.app.locals.broadcastMatchCreated(withSportScoreAttribution(event))
        }

        return res.status(201).json({ data: withSportScoreAttribution(event) })
    } catch (error) {
        console.error("Failed to create match:", error);
        return res.status(500).json({ error: "Failed to create match." })
    }
})

matchRouter.patch("/:id/external", async (req, res) => {
    const parsedParams = matchIdParamSchema.safeParse(req.params);

    if (!parsedParams.success) {
        return res.status(400).json({ error: "Invalid match ID.", details: parsedParams.error.issues });
    }

    const parsedBody = linkMatchSchema.safeParse(req.body);

    if (!parsedBody.success) {
        return res.status(400).json({ error: "Invalid Payload.", details: parsedBody.error.issues });
    }

    try {
        const [event] = await db
            .update(matches)
            .set({
                ...parsedBody.data,
                updatedAt: new Date(),
            })
            .where(eq(matches.id, parsedParams.data.id))
            .returning();

        if (!event) {
            return res.status(404).json({ error: "Match not found." });
        }

        return res.json({ data: withSportScoreAttribution(event) });
    } catch (error) {
        console.error("Failed to link match:", error);
        return res.status(500).json({ error: "Failed to link match." });
    }
})
