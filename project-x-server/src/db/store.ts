import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "./index";
import {
  proximityAttestations,
  sessions,
  webauthnChallenges,
  webauthnCredentials,
  type NewProximityAttestation,
  type NewSession,
  type WebauthnCredential,
} from "./schema";

type ChallengeFlow = "registration" | "authentication";

function ensureRow<T>(row: T | undefined, message: string): T {
  if (!row) {
    throw new Error(message);
  }

  return row;
}

function mapSession(row: typeof sessions.$inferSelect) {
  return {
    sessionId: row.sessionId,
    tripId: row.tripId,
    driverPubkey: row.driverPubkey,
    riderPubkey: row.riderPubkey,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    signatures: {
      partyA: row.partyASignature,
      partyB: row.partyBSignature,
    },
  };
}

function mapProximityAttestation(row: typeof proximityAttestations.$inferSelect) {
  return {
    attestationId: row.attestationId,
    sessionId: row.sessionId,
    driverPubkey: row.driverPubkey,
    riderPubkey: row.riderPubkey,
    driver: {
      pubkey: row.driverPubkey,
      coords: {
        lat: row.driverLat,
        lng: row.driverLng,
        accuracy: row.driverAccuracy ?? undefined,
      },
      clientTimestamp: row.driverClientTimestamp.toISOString(),
      receivedAt: row.driverReceivedAt.toISOString(),
    },
    rider: {
      pubkey: row.riderPubkey,
      coords: {
        lat: row.riderLat,
        lng: row.riderLng,
        accuracy: row.riderAccuracy ?? undefined,
      },
      clientTimestamp: row.riderClientTimestamp.toISOString(),
      receivedAt: row.riderReceivedAt.toISOString(),
    },
    distanceMeters: row.distanceMeters,
    timeDeltaMs: row.timeDeltaMs,
    thresholdMeters: row.thresholdMeters,
    maxTimeDeltaMs: row.maxTimeDeltaMs,
    result: row.result as "approved" | "rejected",
    method: row.method as "gps",
    issuedAt: row.issuedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

export type SessionRecord = ReturnType<typeof mapSession>;
export type ProximityAttestationRecord = ReturnType<
  typeof mapProximityAttestation
>;

export async function getCredential(ownerPubkey: string) {
  const [credential] = await db
    .select()
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.ownerPubkey, ownerPubkey))
    .limit(1);

  return credential ?? null;
}

export async function saveCredential(
  ownerPubkey: string,
  data: Omit<
    WebauthnCredential,
    "id" | "ownerPubkey" | "createdAt" | "updatedAt"
  >,
) {
  const now = new Date();
  const [credential] = await db
    .insert(webauthnCredentials)
    .values({
      ownerPubkey,
      ...data,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: webauthnCredentials.ownerPubkey,
      set: {
        credentialId: data.credentialId,
        publicKey: data.publicKey,
        counter: data.counter,
        transports: data.transports,
        deviceType: data.deviceType,
        backedUp: data.backedUp,
        updatedAt: now,
      },
    })
    .returning();

  return ensureRow(credential, "failed to save credential");
}

export async function saveChallenge(
  ownerPubkey: string,
  flow: ChallengeFlow,
  data: {
    challenge: string;
    expiresAt: Date;
    sessionId?: string | null;
  },
) {
  const [challenge] = await db
    .insert(webauthnChallenges)
    .values({
      ownerPubkey,
      flow,
      challenge: data.challenge,
      expiresAt: data.expiresAt,
      sessionId: data.sessionId ?? null,
      usedAt: null,
    })
    .onConflictDoUpdate({
      target: [webauthnChallenges.ownerPubkey, webauthnChallenges.flow],
      set: {
        challenge: data.challenge,
        expiresAt: data.expiresAt,
        sessionId: data.sessionId ?? null,
        usedAt: null,
      },
    })
    .returning();

  return ensureRow(challenge, "failed to save challenge");
}

export async function getChallenge(ownerPubkey: string, flow: ChallengeFlow) {
  const [challenge] = await db
    .select()
    .from(webauthnChallenges)
    .where(
      and(
        eq(webauthnChallenges.ownerPubkey, ownerPubkey),
        eq(webauthnChallenges.flow, flow),
        gt(webauthnChallenges.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return challenge ?? null;
}

export async function markChallengeUsed(
  ownerPubkey: string,
  flow: ChallengeFlow,
) {
  const [challenge] = await db
    .update(webauthnChallenges)
    .set({
      usedAt: new Date(),
    })
    .where(
      and(
        eq(webauthnChallenges.ownerPubkey, ownerPubkey),
        eq(webauthnChallenges.flow, flow),
      ),
    )
    .returning();

  return ensureRow(challenge, "challenge not found");
}

export async function saveSession(data: NewSession) {
  const [session] = await db
    .insert(sessions)
    .values(data)
    .onConflictDoUpdate({
      target: sessions.sessionId,
      set: {
        tripId: data.tripId,
        driverPubkey: data.driverPubkey,
        riderPubkey: data.riderPubkey ?? null,
        partyASignature: data.partyASignature ?? null,
        partyBSignature: data.partyBSignature ?? null,
        createdAt: data.createdAt,
        expiresAt: data.expiresAt,
        completedAt: data.completedAt ?? null,
      },
    })
    .returning();

  return mapSession(ensureRow(session, "failed to save session"));
}

export async function getSession(sessionId: string) {
  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.sessionId, sessionId),
        gt(sessions.expiresAt, new Date()),
        isNull(sessions.completedAt),
      ),
    )
    .limit(1);

  return session ? mapSession(session) : null;
}

export async function completeSession(sessionId: string) {
  const [session] = await db
    .update(sessions)
    .set({
      completedAt: new Date(),
      expiresAt: new Date(),
    })
    .where(eq(sessions.sessionId, sessionId))
    .returning();

  return session ? mapSession(session) : null;
}

export async function saveSessionSignature(
  sessionId: string,
  party: "partyA" | "partyB",
  signature: string,
) {
  const [session] = await db
    .update(sessions)
    .set(
      party === "partyA"
        ? { partyASignature: signature }
        : { partyBSignature: signature },
    )
    .where(eq(sessions.sessionId, sessionId))
    .returning();

  return session ? mapSession(session) : null;
}

export async function saveProximityAttestation(data: NewProximityAttestation) {
  const [attestation] = await db
    .insert(proximityAttestations)
    .values(data)
    .returning();

  return mapProximityAttestation(
    ensureRow(attestation, "failed to save proximity attestation"),
  );
}

export async function getProximityAttestation(attestationId: string) {
  const [attestation] = await db
    .select()
    .from(proximityAttestations)
    .where(
      and(
        eq(proximityAttestations.attestationId, attestationId),
        gt(proximityAttestations.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return attestation ? mapProximityAttestation(attestation) : null;
}

export async function getLatestApprovedProximityAttestation(
  sessionId: string,
  driverPubkey: string,
  riderPubkey: string,
) {
  const [attestation] = await db
    .select()
    .from(proximityAttestations)
    .where(
      and(
        eq(proximityAttestations.sessionId, sessionId),
        eq(proximityAttestations.driverPubkey, driverPubkey),
        eq(proximityAttestations.riderPubkey, riderPubkey),
        eq(proximityAttestations.result, "approved"),
        gt(proximityAttestations.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(proximityAttestations.issuedAt))
    .limit(1);

  return attestation ? mapProximityAttestation(attestation) : null;
}
