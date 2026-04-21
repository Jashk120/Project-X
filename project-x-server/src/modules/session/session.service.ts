import { randomBytes, verify } from "crypto";
import bs58 from "bs58";

import * as store from "../../db/store";
import { status } from "../solana/solana.service";

const SESSION_TTL_MS = 5 * 60 * 1000;
const JOIN_TOKEN_TTL_MS = 60 * 1000;
const BLE_PRESENCE_TTL_MS = 10 * 1000;
const PRESENCE_SIGNING_DOMAIN = "projectx-presence:v1";
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

type CreateSessionInput = {
  tripId?: string;
  driverPubkey: string;
};

type ConfirmPresenceInput = {
  sessionId: string;
  responderPubkey: string;
  challenge: string;
  signature: string;
};

function generateToken(bytes = 9) {
  return randomBytes(bytes).toString("base64url");
}

function getJoinTokenExpiry(now = new Date()) {
  return new Date(now.getTime() + JOIN_TOKEN_TTL_MS);
}

function getPresenceExpiry(now = new Date()) {
  return new Date(now.getTime() + BLE_PRESENCE_TTL_MS);
}

function buildPresenceSigningPayload(
  sessionId: string,
  challenge: string,
  expiresAt: string,
) {
  return `${PRESENCE_SIGNING_DOMAIN}|${sessionId}|${challenge}|${expiresAt}|role=partyB`;
}

function decodeSignature(signature: string) {
  try {
    return Buffer.from(bs58.decode(signature));
  } catch {
    return Buffer.from(signature, "base64");
  }
}

function verifyEd25519Signature(
  pubkey: string,
  message: string,
  signature: string,
) {
  const publicKey = Buffer.from(bs58.decode(pubkey));
  const key = Buffer.concat([ED25519_SPKI_PREFIX, publicKey]);
  return verify(
    null,
    Buffer.from(message, "utf8"),
    {
      key,
      format: "der",
      type: "spki",
    },
    decodeSignature(signature),
  );
}

function assertPresenceChallengeFresh(session: Awaited<ReturnType<typeof getSession>>) {
  if (!session.presence.challenge || !session.presence.challengeExpiresAt) {
    throw new Error("presence challenge not found");
  }

  if (session.presence.challengeUsedAt) {
    throw new Error("presence challenge already used");
  }

  if (new Date(session.presence.challengeExpiresAt).getTime() <= Date.now()) {
    throw new Error("presence challenge expired");
  }
}

async function refreshJoinToken(sessionId: string) {
  const joinToken = generateToken();
  const joinTokenExpiresAt = getJoinTokenExpiry();
  const updated = await store.updateSession(sessionId, {
    joinToken,
    joinTokenExpiresAt,
  });

  if (!updated) {
    throw new Error("session not found or expired");
  }

  return updated;
}

export async function createSession({
  tripId,
  driverPubkey,
}: CreateSessionInput) {
  const sessionId = tripId?.trim() || generateToken();
  const existing = await store.getSession(sessionId);
  if (existing) {
    if (existing.driverPubkey !== driverPubkey) {
      throw new Error("session already belongs to a different driver");
    }

    return refreshJoinToken(existing.sessionId);
  }

  const now = new Date();
  return store.saveSession({
    sessionId,
    tripId: sessionId,
    driverPubkey,
    riderPubkey: null,
    joinToken: generateToken(),
    joinTokenExpiresAt: getJoinTokenExpiry(now),
    partyASignature: null,
    partyBSignature: null,
    blePresenceChallenge: null,
    blePresenceChallengeExpiresAt: null,
    blePresenceChallengeUsedAt: null,
    blePresenceConfirmedAt: null,
    blePresenceConfirmedByPubkey: null,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    completedAt: null,
  });
}

async function joinValidatedSession(
  session: Awaited<ReturnType<typeof getSession>>,
  riderPubkey: string,
) {
  if (session.driverPubkey === riderPubkey) {
    throw new Error("rider pubkey cannot be the same as driver");
  }

  if (session.riderPubkey && session.riderPubkey !== riderPubkey) {
    throw new Error("session already has a different rider");
  }

  if (session.riderPubkey === riderPubkey) {
    return session;
  }

  const enrolled = await status(riderPubkey);
  if (!enrolled.isActive) {
    throw new Error("rider pubkey is not enrolled");
  }

  return store.saveSession({
    sessionId: session.sessionId,
    tripId: session.tripId,
    driverPubkey: session.driverPubkey,
    riderPubkey,
    joinToken: session.joinToken,
    joinTokenExpiresAt: session.joinTokenExpiresAt
      ? new Date(session.joinTokenExpiresAt)
      : null,
    partyASignature: session.signatures.partyA,
    partyBSignature: session.signatures.partyB,
    blePresenceChallenge: session.presence.challenge,
    blePresenceChallengeExpiresAt: session.presence.challengeExpiresAt
      ? new Date(session.presence.challengeExpiresAt)
      : null,
    blePresenceChallengeUsedAt: session.presence.challengeUsedAt
      ? new Date(session.presence.challengeUsedAt)
      : null,
    blePresenceConfirmedAt: session.presence.confirmedAt
      ? new Date(session.presence.confirmedAt)
      : null,
    blePresenceConfirmedByPubkey: session.presence.confirmedByPubkey,
    createdAt: new Date(session.createdAt),
    expiresAt: new Date(session.expiresAt),
    completedAt: session.completedAt ? new Date(session.completedAt) : null,
  });
}

export async function joinSessionAsRider(sessionId: string, riderPubkey: string) {
  const session = await getSession(sessionId);
  return joinValidatedSession(session, riderPubkey);
}

export async function joinSessionByToken(joinToken: string, riderPubkey: string) {
  const session = await store.getSessionByJoinToken(joinToken);
  if (!session) {
    throw new Error("join token not found or expired");
  }

  return joinValidatedSession(session, riderPubkey);
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
  sig: string,
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

export async function issuePresenceChallenge(
  sessionId: string,
  requesterPubkey: string,
) {
  const session = await getSession(sessionId);
  if (session.driverPubkey !== requesterPubkey) {
    throw new Error("only the driver can issue a presence challenge");
  }

  if (!session.riderPubkey) {
    throw new Error("session does not have a rider yet");
  }

  const challenge = generateToken(8);
  const expiresAt = getPresenceExpiry();
  const updated = await store.updateSession(sessionId, {
    blePresenceChallenge: challenge,
    blePresenceChallengeExpiresAt: expiresAt,
    blePresenceChallengeUsedAt: null,
    blePresenceConfirmedAt: null,
    blePresenceConfirmedByPubkey: null,
  });

  if (!updated) {
    throw new Error("session not found or expired");
  }

  return {
    sessionId: updated.sessionId,
    challenge,
    expiresAt: expiresAt.toISOString(),
    signingPayload: buildPresenceSigningPayload(
      updated.sessionId,
      challenge,
      expiresAt.toISOString(),
    ),
  };
}

export async function confirmPresenceChallenge({
  sessionId,
  responderPubkey,
  challenge,
  signature,
}: ConfirmPresenceInput) {
  const session = await getSession(sessionId);
  if (!session.riderPubkey || session.riderPubkey !== responderPubkey) {
    throw new Error("presence responder pubkey does not match session rider");
  }

  assertPresenceChallengeFresh(session);

  if (session.presence.challenge !== challenge) {
    throw new Error("presence challenge does not match session");
  }

  const signingPayload = buildPresenceSigningPayload(
    session.sessionId,
    challenge,
    session.presence.challengeExpiresAt!,
  );

  if (!verifyEd25519Signature(responderPubkey, signingPayload, signature)) {
    throw new Error("presence signature is invalid");
  }

  const confirmedAt = new Date();
  const updated = await store.updateSession(sessionId, {
    blePresenceChallengeUsedAt: confirmedAt,
    blePresenceConfirmedAt: confirmedAt,
    blePresenceConfirmedByPubkey: responderPubkey,
  });

  if (!updated) {
    throw new Error("session not found or expired");
  }

  return {
    sessionId: updated.sessionId,
    confirmed: true,
    confirmedAt: confirmedAt.toISOString(),
    confirmedByPubkey: responderPubkey,
  };
}

export async function getPresenceState(sessionId: string) {
  const session = await getSession(sessionId);
  return {
    sessionId: session.sessionId,
    challengeActive: Boolean(
      session.presence.challenge &&
        session.presence.challengeExpiresAt &&
        new Date(session.presence.challengeExpiresAt).getTime() > Date.now() &&
        !session.presence.challengeUsedAt,
    ),
    challengeExpiresAt: session.presence.challengeExpiresAt,
    confirmed: Boolean(session.presence.confirmedAt),
    confirmedAt: session.presence.confirmedAt,
    confirmedByPubkey: session.presence.confirmedByPubkey,
  };
}
