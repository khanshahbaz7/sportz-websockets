ALTER TABLE "commentary" ADD COLUMN "external_event_id" text;--> statement-breakpoint
ALTER TABLE "commentary" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "external_source" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "external_slug" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "competition" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "competition_slug" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "status_text" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "live_minute" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "home_score_text" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "away_score_text" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "home_wickets" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "away_wickets" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "home_ht_score" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "away_ht_score" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "last_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "commentary_match_external_event_idx" ON "commentary" USING btree ("match_id","external_event_id");--> statement-breakpoint
CREATE INDEX "commentary_match_created_idx" ON "commentary" USING btree ("match_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_external_source_external_id_idx" ON "matches" USING btree ("external_source","external_id");--> statement-breakpoint
CREATE INDEX "matches_status_start_time_idx" ON "matches" USING btree ("status","start_time");