import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { db, sql } from "../db";
import {
  proximityAttestations,
  sessions,
  webauthnChallenges,
  webauthnCredentials,
} from "../db/schema";

type ChallengeRecord = {
  challenge: string;
  expiresAt: string;
  usedAt?: string;
};

type SessionRecord = {
  sessionId: string;
  tripId: string;
  driverPubkey: string;
  riderPubkey: string | null;
  createdAt: string;
  expiresAt: string;
  completedAt?: string;
  signatures?: {
    partyA: string | null;
    partyB: string | null;
  };
};

type ProximityCoordinateRecord = {
  lat: number;
  lng: number;
  accuracy?: number;
};

type ProximityPartyRecord = {
  pubkey: string;
  coords: ProximityCoordinateRecord;
  clientTimestamp: string;
  receivedAt: string;
};

type ProximityAttestationRecord = {
  attestationId: string;
  sessionId: string;
  driverPubkey: string;
  riderPubkey: string;
  driver: ProximityPartyRecord;
  rider: ProximityPartyRecord;
  distanceMeters: number;
  timeDeltaMs: number;
  thresholdMeters: number;
  maxTimeDeltaMs: number;
  result: "approved" | "rejected";
  method: "gps";
  issuedAt: string;
  expiresAt: string;
};

type CredentialRecord = {
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[] | null;
  deviceType: string;
  backedUp: boolean;
};

type StoreFile = {
  regChallenges?: Record<string, ChallengeRecord>;
  authChallenges?: Record<string, ChallengeRecord>;
  sessions?: Record<string, SessionRecord>;
  proximityAttestations?: Record<string, ProximityAttestationRecord>;
  credentials?: Record<string, CredentialRecord>;
};

const DATA_PATH = join(process.cwd(), "data.json");

function toDate(value: string | undefined) {
  return value ? new Date(value) : null;
}

async function main() {
  if (!existsSync(DATA_PATH)) {
    console.log(`No filestore found at ${DATA_PATH}, skipping import.`);
    return;
  }

  const raw = JSON.parse(readFileSync(DATA_PATH, "utf8")) as StoreFile;

  const credentials = Object.entries(raw.credentials ?? {});
  for (const [ownerPubkey, credential] of credentials) {
    await db
      .insert(webauthnCredentials)
      .values({
        ownerPubkey,
        credentialId: credential.credentialId,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: credential.transports,
        deviceType: credential.deviceType,
        backedUp: credential.backedUp,
      })
      .onConflictDoUpdate({
        target: webauthnCredentials.ownerPubkey,
        set: {
          credentialId: credential.credentialId,
          publicKey: credential.publicKey,
          counter: credential.counter,
          transports: credential.transports,
          deviceType: credential.deviceType,
          backedUp: credential.backedUp,
          updatedAt: new Date(),
        },
      });
  }

  for (const [ownerPubkey, challenge] of Object.entries(raw.regChallenges ?? {})) {
    await db
      .insert(webauthnChallenges)
      .values({
        ownerPubkey,
        challenge: challenge.challenge,
        flow: "registration",
        expiresAt: new Date(challenge.expiresAt),
        usedAt: toDate(challenge.usedAt),
      })
      .onConflictDoUpdate({
        target: [webauthnChallenges.ownerPubkey, webauthnChallenges.flow],
        set: {
          challenge: challenge.challenge,
          expiresAt: new Date(challenge.expiresAt),
          usedAt: toDate(challenge.usedAt),
          sessionId: null,
        },
      });
  }

  for (const [ownerPubkey, challenge] of Object.entries(raw.authChallenges ?? {})) {
    await db
      .insert(webauthnChallenges)
      .values({
        ownerPubkey,
        challenge: challenge.challenge,
        flow: "authentication",
        expiresAt: new Date(challenge.expiresAt),
        usedAt: toDate(challenge.usedAt),
      })
      .onConflictDoUpdate({
        target: [webauthnChallenges.ownerPubkey, webauthnChallenges.flow],
        set: {
          challenge: challenge.challenge,
          expiresAt: new Date(challenge.expiresAt),
          usedAt: toDate(challenge.usedAt),
          sessionId: null,
        },
      });
  }

  for (const session of Object.values(raw.sessions ?? {})) {
    await db
      .insert(sessions)
      .values({
        sessionId: session.sessionId,
        tripId: session.tripId,
        driverPubkey: session.driverPubkey,
        riderPubkey: session.riderPubkey,
        partyASignature: session.signatures?.partyA ?? null,
        partyBSignature: session.signatures?.partyB ?? null,
        createdAt: new Date(session.createdAt),
        expiresAt: new Date(session.expiresAt),
        completedAt: toDate(session.completedAt),
      })
      .onConflictDoUpdate({
        target: sessions.sessionId,
        set: {
          tripId: session.tripId,
          driverPubkey: session.driverPubkey,
          riderPubkey: session.riderPubkey,
          partyASignature: session.signatures?.partyA ?? null,
          partyBSignature: session.signatures?.partyB ?? null,
          createdAt: new Date(session.createdAt),
          expiresAt: new Date(session.expiresAt),
          completedAt: toDate(session.completedAt),
        },
      });
  }

  for (const attestation of Object.values(raw.proximityAttestations ?? {})) {
    await db
      .insert(proximityAttestations)
      .values({
        attestationId: attestation.attestationId,
        sessionId: attestation.sessionId,
        driverPubkey: attestation.driverPubkey,
        riderPubkey: attestation.riderPubkey,
        driverLat: attestation.driver.coords.lat,
        driverLng: attestation.driver.coords.lng,
        driverAccuracy: attestation.driver.coords.accuracy ?? null,
        driverClientTimestamp: new Date(attestation.driver.clientTimestamp),
        driverReceivedAt: new Date(attestation.driver.receivedAt),
        riderLat: attestation.rider.coords.lat,
        riderLng: attestation.rider.coords.lng,
        riderAccuracy: attestation.rider.coords.accuracy ?? null,
        riderClientTimestamp: new Date(attestation.rider.clientTimestamp),
        riderReceivedAt: new Date(attestation.rider.receivedAt),
        distanceMeters: attestation.distanceMeters,
        timeDeltaMs: attestation.timeDeltaMs,
        thresholdMeters: attestation.thresholdMeters,
        maxTimeDeltaMs: attestation.maxTimeDeltaMs,
        result: attestation.result,
        method: attestation.method,
        issuedAt: new Date(attestation.issuedAt),
        expiresAt: new Date(attestation.expiresAt),
      })
      .onConflictDoUpdate({
        target: proximityAttestations.attestationId,
        set: {
          sessionId: attestation.sessionId,
          driverPubkey: attestation.driverPubkey,
          riderPubkey: attestation.riderPubkey,
          driverLat: attestation.driver.coords.lat,
          driverLng: attestation.driver.coords.lng,
          driverAccuracy: attestation.driver.coords.accuracy ?? null,
          driverClientTimestamp: new Date(attestation.driver.clientTimestamp),
          driverReceivedAt: new Date(attestation.driver.receivedAt),
          riderLat: attestation.rider.coords.lat,
          riderLng: attestation.rider.coords.lng,
          riderAccuracy: attestation.rider.coords.accuracy ?? null,
          riderClientTimestamp: new Date(attestation.rider.clientTimestamp),
          riderReceivedAt: new Date(attestation.rider.receivedAt),
          distanceMeters: attestation.distanceMeters,
          timeDeltaMs: attestation.timeDeltaMs,
          thresholdMeters: attestation.thresholdMeters,
          maxTimeDeltaMs: attestation.maxTimeDeltaMs,
          result: attestation.result,
          method: attestation.method,
          issuedAt: new Date(attestation.issuedAt),
          expiresAt: new Date(attestation.expiresAt),
        },
      });
  }

  console.log(
    `Imported ${credentials.length} credentials, ${Object.keys(raw.regChallenges ?? {}).length} registration challenges, ${Object.keys(raw.authChallenges ?? {}).length} authentication challenges, ${Object.keys(raw.sessions ?? {}).length} sessions, and ${Object.keys(raw.proximityAttestations ?? {}).length} proximity attestations.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });
