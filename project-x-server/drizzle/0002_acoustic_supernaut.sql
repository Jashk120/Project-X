ALTER TABLE "coordination"."sessions" ADD COLUMN "join_token" text;--> statement-breakpoint
ALTER TABLE "coordination"."sessions" ADD COLUMN "join_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "coordination"."sessions" ADD COLUMN "ble_presence_challenge" text;--> statement-breakpoint
ALTER TABLE "coordination"."sessions" ADD COLUMN "ble_presence_challenge_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "coordination"."sessions" ADD COLUMN "ble_presence_challenge_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "coordination"."sessions" ADD COLUMN "ble_presence_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "coordination"."sessions" ADD COLUMN "ble_presence_confirmed_by_pubkey" text;--> statement-breakpoint
CREATE INDEX "sessions_join_token_idx" ON "coordination"."sessions" USING btree ("join_token");