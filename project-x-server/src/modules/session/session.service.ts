import { filestore } from "../../db/filestore";

type CreateSessionInput = {
  tripId: string;
  driverPubkey: string;
  riderPubkey: string;
};

export function createSession({
  tripId,
  driverPubkey,
  riderPubkey,
}: CreateSessionInput) {
  const now = new Date();
  const session = {
    sessionId: tripId,
    tripId,
    driverPubkey,
    riderPubkey,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    signatures: {
      partyA: null,
      partyB: null,
    },
  };

  filestore.setSession(session.sessionId, session);

  return session;
}

export function getSession(sessionId: string) {
  const session = filestore.getSession(sessionId);
  if (!session) {
    throw new Error("session not found or expired");
  }

  return session;
}

export function closeSession(sessionId: string) {
  const session = getSession(sessionId);
  filestore.completeSession(sessionId);

  return {
    ...session,
    completedAt: new Date().toISOString(),
  };
}

export function storeSignature(
  sessionId: string,
  party: "partyA" | "partyB",
  sig: string,
) {
  const session = getSession(sessionId);
  const updated = {
    ...session,
    signatures: {
      ...session.signatures,
      [party]: sig,
    },
  };

  filestore.setSession(sessionId, updated);

  return updated;
}

export function areBothSigned(sessionId: string): boolean {
  const session = getSession(sessionId);
  return Boolean(session.signatures.partyA && session.signatures.partyB);
}
