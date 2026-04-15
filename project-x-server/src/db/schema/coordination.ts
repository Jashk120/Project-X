import {
  doublePrecision,
  index,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const coordinationSchema = pgSchema("coordination");

export const sessions = coordinationSchema.table(
  "sessions",
  {
    sessionId: text("session_id").primaryKey(),
    tripId: text("trip_id").notNull(),
    driverPubkey: text("driver_pubkey").notNull(),
    riderPubkey: text("rider_pubkey"),
    partyASignature: text("party_a_signature"),
    partyBSignature: text("party_b_signature"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("sessions_driver_pubkey_idx").on(table.driverPubkey),
    index("sessions_rider_pubkey_idx").on(table.riderPubkey),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const proximityAttestations = coordinationSchema.table(
  "proximity_attestations",
  {
    attestationId: uuid("attestation_id").defaultRandom().primaryKey(),
    sessionId: text("session_id").notNull(),
    driverPubkey: text("driver_pubkey").notNull(),
    riderPubkey: text("rider_pubkey").notNull(),
    driverLat: doublePrecision("driver_lat").notNull(),
    driverLng: doublePrecision("driver_lng").notNull(),
    driverAccuracy: doublePrecision("driver_accuracy"),
    driverClientTimestamp: timestamp("driver_client_timestamp", {
      withTimezone: true,
    }).notNull(),
    driverReceivedAt: timestamp("driver_received_at", {
      withTimezone: true,
    }).notNull(),
    riderLat: doublePrecision("rider_lat").notNull(),
    riderLng: doublePrecision("rider_lng").notNull(),
    riderAccuracy: doublePrecision("rider_accuracy"),
    riderClientTimestamp: timestamp("rider_client_timestamp", {
      withTimezone: true,
    }).notNull(),
    riderReceivedAt: timestamp("rider_received_at", {
      withTimezone: true,
    }).notNull(),
    distanceMeters: doublePrecision("distance_meters").notNull(),
    timeDeltaMs: doublePrecision("time_delta_ms").notNull(),
    thresholdMeters: doublePrecision("threshold_meters").notNull(),
    maxTimeDeltaMs: doublePrecision("max_time_delta_ms").notNull(),
    result: text("result").notNull(),
    method: text("method").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("proximity_attestations_session_idx").on(table.sessionId),
    index("proximity_attestations_lookup_idx").on(
      table.sessionId,
      table.driverPubkey,
      table.riderPubkey,
      table.result,
      table.issuedAt,
    ),
    index("proximity_attestations_expires_at_idx").on(table.expiresAt),
  ],
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type ProximityAttestation = typeof proximityAttestations.$inferSelect;
export type NewProximityAttestation = typeof proximityAttestations.$inferInsert;
