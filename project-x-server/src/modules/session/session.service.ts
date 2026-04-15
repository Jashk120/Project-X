import * as store from "../../db/store";
import { status } from "../solana/solana.service";

const SESSION_TTL_MS = 5 * 60 * 1000;

type CreateSessionInput = {
  tripId: string;
  driverPubkey: string;
};

export async function createSession({
  tripId,
  driverPubkey,
}: CreateSessionInput) {
  const existing = await store.getSession(tripId);
  if (existing) {
    if (existing.driverPubkey !== driverPubkey) {
      throw new Error("session already belongs to a different driver");
    }

    return existing;
  }

  const now = new Date();
  return store.saveSession({
    sessionId: tripId,
    tripId,
    driverPubkey,
    riderPubkey: null,
    partyASignature: null,
    partyBSignature: null,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    completedAt: null,
  });
}

export async function joinSessionAsRider(
  sessionId: string,
  riderPubkey: string
) {
  const session = await getSession(sessionId);

  if (session.driverPubkey === riderPubkey) {
    throw new Error("rider pubkey cannot be the same as driver");
  }

  // if rider already set, just validate it matches
  if (session.riderPubkey && session.riderPubkey !== riderPubkey) {
    throw new Error("session already has a different rider");
  }

  if (session.riderPubkey === riderPubkey) {
    return session;
  }

  // check enrolled on chain
  const enrolled = await status(riderPubkey);
  if (!enrolled.isActive) {
    throw new Error("rider pubkey is not enrolled");
  }

  return store.saveSession({
    sessionId: session.sessionId,
    tripId: session.tripId,
    driverPubkey: session.driverPubkey,
    riderPubkey,
    partyASignature: session.signatures.partyA,
    partyBSignature: session.signatures.partyB,
    createdAt: new Date(session.createdAt),
    expiresAt: new Date(session.expiresAt),
    completedAt: session.completedAt ? new Date(session.completedAt) : null,
  });
}

export async function getSession(sessionId: string) {
  const session = await store.getSession(sessionId);
  if (!session) {
    throw new Error("session not found or expired");
  }
  return session;
}

export async function closeSession(sessionId: string) {
  await getSession(sessionId);
  const session = await store.completeSession(sessionId);
  if (!session) {
    throw new Error("session not found or expired");
  }
  return session;
}

export async function storeSignature(
  sessionId: string,
  party: "partyA" | "partyB",
  sig: string
) {
  await getSession(sessionId);
  const updated = await store.saveSessionSignature(sessionId, party, sig);
  if (!updated) {
    throw new Error("session not found or expired");
  }
  return updated;
}

export async function areBothSigned(sessionId: string): Promise<boolean> {
  const session = await getSession(sessionId);
  return Boolean(session.signatures.partyA && session.signatures.partyB);
}
