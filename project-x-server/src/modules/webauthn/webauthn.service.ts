import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { createHash } from "crypto";
import { env } from "../../config/env";
import { parsePublicKey } from "../solana/solana.service";
import * as store from "../../db/store";
import { getIo } from "../../socket/socket.instance";
import { storeSignature } from "../session/session.service";

const expectedOrigins = env.WEBAUTHN_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function decodeBase64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const buffer = decodeBase64Url(value);
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  const view: Uint8Array<ArrayBuffer> = new Uint8Array(arrayBuffer);
  view.set(buffer);
  return view;
}

function parseTransports(
  transports?: AuthenticatorTransportFuture[],
): string[] | null {
  if (!transports?.length) return null;
  return transports.map((t) => t.toString());
}

function emitVerifyResult(
  sessionId: string,
  driverPubkey: string,
  result: { verified: boolean; reason: string },
) {
  getIo().to(sessionId).emit("verify:result", {
    ...result,
    driverPubkey,
    timestamp: Date.now(),
  });
}

function getSessionParty(
  session: { driverPubkey: string; riderPubkey: string | null },
  subjectPubkey: string,
): "partyA" | "partyB" {
  if (subjectPubkey === session.driverPubkey) return "partyA";
  if (subjectPubkey === session.riderPubkey) return "partyB";
  throw new Error("subject pubkey does not match session party");
}

function getAuthenticationSignature(response: any): string {
  const signature = response?.response?.signature;
  if (typeof signature !== "string" || !signature) {
    throw new Error("authentication signature missing");
  }

  return signature;
}

export async function beginRegistration(subjectPubkey: string) {
  const ownerKey = parsePublicKey(subjectPubkey, "subjectPubkey");

  const existing = await store.getCredential(ownerKey.toBase58());

  const options = await generateRegistrationOptions({
    rpName: env.WEBAUTHN_RP_NAME,
    rpID: env.WEBAUTHN_RP_ID,
    userName: ownerKey.toBase58(),
    userID: new Uint8Array(ownerKey.toBytes()),
    attestationType: "none",
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "preferred",
      userVerification: "preferred",
    },
    excludeCredentials: existing
      ? [{ id: existing.credentialId, transports: (existing.transports ?? []) as AuthenticatorTransportFuture[] }]
      : [],
    supportedAlgorithmIDs: [-7, -257],
  });

  await store.saveChallenge(ownerKey.toBase58(), "registration", {
    challenge: options.challenge,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });

  return options;
}

export async function completeRegistration(
  subjectPubkey: string,
  response: RegistrationResponseJSON,
) {
  const ownerKey = parsePublicKey(subjectPubkey, "subjectPubkey");

  const challengeRecord = await store.getChallenge(
    ownerKey.toBase58(),
    "registration",
  );

  if (!challengeRecord) {
    throw new Error("registration challenge not found or expired");
  }

  if (challengeRecord.usedAt) {
    throw new Error("challenge already used");
  }

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challengeRecord.challenge,
    expectedOrigin: expectedOrigins,
    expectedRPID: env.WEBAUTHN_RP_ID,
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("webauthn registration verification failed");
  }

  const { credential, credentialBackedUp, credentialDeviceType } =
    verification.registrationInfo;

  const credentialHash = createHash("sha256")
    .update(decodeBase64Url(response.rawId))
    .digest();

  await store.markChallengeUsed(ownerKey.toBase58(), "registration");

  await store.saveCredential(ownerKey.toBase58(), {
    credentialId: response.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: parseTransports(credential.transports),
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
  });

  return {
    success: true,
    credentialId: response.id,
    credentialHash: credentialHash.toString("hex"),
    webauthn: {
      verified: true,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
    },
  };
}

export async function beginVerification(subjectPubkey: string) {
  const ownerKey = parsePublicKey(subjectPubkey, "subjectPubkey");
  const credential = await store.getCredential(ownerKey.toBase58());

  if (!credential) {
    throw new Error("credential not found");
  }

  const options = await generateAuthenticationOptions({
    rpID: env.WEBAUTHN_RP_ID,
    allowCredentials: [{
      id: credential.credentialId,
      transports: (credential.transports ?? []) as AuthenticatorTransportFuture[],
    }],
    userVerification: "required",
  });

  await store.saveChallenge(ownerKey.toBase58(), "authentication", {
    challenge: options.challenge,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });

  return options;
}

export async function completeVerification(
  sessionId: string,
  subjectPubkey: string,
  response: any,
) {
  const session = await store.getSession(sessionId);
  if (!session) {
    throw new Error("session not found or expired");
  }

  const ownerKey = parsePublicKey(subjectPubkey, "subjectPubkey");
  const ownerPubkey = ownerKey.toBase58();
  const party = getSessionParty(session, ownerPubkey);

  const challengeRecord = await store.getChallenge(
    ownerPubkey,
    "authentication",
  );

  if (!challengeRecord) {
    throw new Error("authentication challenge not found or expired");
  }

  if (challengeRecord.usedAt) {
    throw new Error("authentication challenge already used");
  }

  const credential = await store.getCredential(ownerPubkey);

  if (!credential) {
    throw new Error("credential not found");
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: response as AuthenticationResponseJSON,
      expectedChallenge: challengeRecord.challenge,
      expectedOrigin: expectedOrigins,
      expectedRPID: env.WEBAUTHN_RP_ID,
      credential: {
        id: credential.credentialId,
        publicKey: decodeBase64UrlToUint8Array(credential.publicKey),
        counter: credential.counter,
        transports: (credential.transports ?? []) as AuthenticatorTransportFuture[],
      },
    });
  } catch {
    const result = { verified: false, reason: "biometric failed" };
    emitVerifyResult(sessionId, session.driverPubkey, result);
    return result;
  }

  if (!verification.verified) {
    const result = { verified: false, reason: "biometric failed" };
    emitVerifyResult(sessionId, session.driverPubkey, result);
    return result;
  }

  await store.markChallengeUsed(ownerPubkey, "authentication");
  await store.saveCredential(ownerPubkey, {
    ...credential,
    counter: verification.authenticationInfo.newCounter,
  });

  await storeSignature(sessionId, party, getAuthenticationSignature(response));

  return {
    verified: true,
    reason: "biometric verified",
  };
}
