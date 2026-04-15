import {
  boolean,
  integer,
  index,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const identitySchema = pgSchema("identity");

export const webauthnCredentials = identitySchema.table(
  "webauthn_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerPubkey: text("owner_pubkey").notNull(),
    credentialId: text("credential_id").notNull(),
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    transports: text("transports").array(),
    deviceType: text("device_type"),
    backedUp: boolean("backed_up"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("webauthn_credentials_owner_pubkey_idx").on(table.ownerPubkey),
    uniqueIndex("webauthn_credentials_credential_id_idx").on(table.credentialId),
  ]
);

export const webauthnChallenges = identitySchema.table(
  "webauthn_challenges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerPubkey: text("owner_pubkey").notNull(),
    challenge: text("challenge").notNull(),
    flow: text("flow").notNull(),
    sessionId: text("session_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("webauthn_challenges_owner_pubkey_flow_idx").on(
      table.ownerPubkey,
      table.flow,
    ),
    index("webauthn_challenges_expires_at_idx").on(table.expiresAt),
  ]
);

export type WebauthnCredential = typeof webauthnCredentials.$inferSelect;
export type NewWebauthnCredential = typeof webauthnCredentials.$inferInsert;
export type WebauthnChallenge = typeof webauthnChallenges.$inferSelect;
export type NewWebauthnChallenge = typeof webauthnChallenges.$inferInsert;
