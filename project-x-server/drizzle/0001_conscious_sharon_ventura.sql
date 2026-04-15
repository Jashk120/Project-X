CREATE SCHEMA "coordination";
--> statement-breakpoint
CREATE TABLE "coordination"."proximity_attestations" (
	"attestation_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"driver_pubkey" text NOT NULL,
	"rider_pubkey" text NOT NULL,
	"driver_lat" double precision NOT NULL,
	"driver_lng" double precision NOT NULL,
	"driver_accuracy" double precision,
	"driver_client_timestamp" timestamp with time zone NOT NULL,
	"driver_received_at" timestamp with time zone NOT NULL,
	"rider_lat" double precision NOT NULL,
	"rider_lng" double precision NOT NULL,
	"rider_accuracy" double precision,
	"rider_client_timestamp" timestamp with time zone NOT NULL,
	"rider_received_at" timestamp with time zone NOT NULL,
	"distance_meters" double precision NOT NULL,
	"time_delta_ms" double precision NOT NULL,
	"threshold_meters" double precision NOT NULL,
	"max_time_delta_ms" double precision NOT NULL,
	"result" text NOT NULL,
	"method" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coordination"."sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"driver_pubkey" text NOT NULL,
	"rider_pubkey" text,
	"party_a_signature" text,
	"party_b_signature" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "proximity_attestations_session_idx" ON "coordination"."proximity_attestations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "proximity_attestations_lookup_idx" ON "coordination"."proximity_attestations" USING btree ("session_id","driver_pubkey","rider_pubkey","result","issued_at");--> statement-breakpoint
CREATE INDEX "proximity_attestations_expires_at_idx" ON "coordination"."proximity_attestations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sessions_driver_pubkey_idx" ON "coordination"."sessions" USING btree ("driver_pubkey");--> statement-breakpoint
CREATE INDEX "sessions_rider_pubkey_idx" ON "coordination"."sessions" USING btree ("rider_pubkey");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "coordination"."sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webauthn_challenges_owner_pubkey_flow_idx" ON "identity"."webauthn_challenges" USING btree ("owner_pubkey","flow");--> statement-breakpoint
CREATE INDEX "webauthn_challenges_expires_at_idx" ON "identity"."webauthn_challenges" USING btree ("expires_at");