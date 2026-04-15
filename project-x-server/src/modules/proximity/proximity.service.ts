import { randomUUID } from "node:crypto";
import * as store from "../../db/store";
import { getSession } from "../session/session.service";

const MAX_TIME_DELTA_MS = 30_000;
const DISTANCE_THRESHOLD_METERS = 50;
const MAX_ACCURACY_METERS = 50;
const MAX_SERVER_RECEIVE_DELTA_MS = 30_000;
const ATTESTATION_TTL_MS = 60_000;

type CoordinatesInput = {
  lat: number;
  lng: number;
  accuracy?: number;
};

type PartyProximityInput = {
  pubkey: string;
  coords: CoordinatesInput;
  timestamp: string;
};

type AttestProximityInput = {
  sessionId: string;
  driver: PartyProximityInput;
  rider: PartyProximityInput;
};

function toTimestamp(value: string, label: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`invalid ${label}`);
  }

  return parsed;
}

function assertCoordinates(coords: CoordinatesInput, label: string) {
  if (!Number.isFinite(coords.lat) || coords.lat < -90 || coords.lat > 90) {
    throw new Error(`invalid ${label}.lat`);
  }

  if (!Number.isFinite(coords.lng) || coords.lng < -180 || coords.lng > 180) {
    throw new Error(`invalid ${label}.lng`);
  }

  if (
    coords.accuracy !== undefined &&
    (!Number.isFinite(coords.accuracy) || coords.accuracy < 0)
  ) {
    throw new Error(`invalid ${label}.accuracy`);
  }
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversine(
  left: CoordinatesInput,
  right: CoordinatesInput,
) {
  const earthRadiusMeters = 6_371_000;
  const latDelta = toRadians(right.lat - left.lat);
  const lngDelta = toRadians(right.lng - left.lng);
  const latLeft = toRadians(left.lat);
  const latRight = toRadians(right.lat);

  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(latLeft) *
      Math.cos(latRight) *
      Math.sin(lngDelta / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(a));
}

function checkProximity(driver: PartyProximityInput, rider: PartyProximityInput) {
  const driverTimestamp = toTimestamp(driver.timestamp, "driver.timestamp");
  const riderTimestamp = toTimestamp(rider.timestamp, "rider.timestamp");
  const timeDeltaMs = Math.abs(
    driverTimestamp.getTime() - riderTimestamp.getTime(),
  );
  const distanceMeters = haversine(driver.coords, rider.coords);
  const driverAccuracy = driver.coords.accuracy ?? Number.POSITIVE_INFINITY;
  const riderAccuracy = rider.coords.accuracy ?? Number.POSITIVE_INFINITY;

  return {
    approved:
      timeDeltaMs <= MAX_TIME_DELTA_MS &&
      distanceMeters <= DISTANCE_THRESHOLD_METERS &&
      driverAccuracy <= MAX_ACCURACY_METERS &&
      riderAccuracy <= MAX_ACCURACY_METERS,
    distanceMeters,
    timeDeltaMs,
  };
}

export async function attestProximity({
  sessionId,
  driver,
  rider,
}: AttestProximityInput) {
  assertCoordinates(driver.coords, "driver.coords");
  assertCoordinates(rider.coords, "rider.coords");

  const session = await getSession(sessionId);
  const riderSessionPubkey = session.riderPubkey;

  if (!riderSessionPubkey) {
    throw new Error("session rider missing");
  }

  if (session.driverPubkey !== driver.pubkey) {
    throw new Error("driver pubkey does not match session");
  }

  if (riderSessionPubkey !== rider.pubkey) {
    throw new Error("rider pubkey does not match session");
  }

  const now = new Date();
  const driverTimestamp = toTimestamp(driver.timestamp, "driver.timestamp");
  const riderTimestamp = toTimestamp(rider.timestamp, "rider.timestamp");

  if (Math.abs(now.getTime() - driverTimestamp.getTime()) > MAX_SERVER_RECEIVE_DELTA_MS) {
    throw new Error("driver coordinates are stale");
  }

  if (Math.abs(now.getTime() - riderTimestamp.getTime()) > MAX_SERVER_RECEIVE_DELTA_MS) {
    throw new Error("rider coordinates are stale");
  }

  const { approved, distanceMeters, timeDeltaMs } = checkProximity(driver, rider);
  const attestationId = randomUUID();
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ATTESTATION_TTL_MS).toISOString();

  const attestation: ReturnType<typeof buildAttestationRecord> = buildAttestationRecord({
    attestationId,
    sessionId,
    driverPubkey: session.driverPubkey,
    riderPubkey: riderSessionPubkey,
    driver,
    rider,
    driverTimestamp,
    riderTimestamp,
    distanceMeters,
    timeDeltaMs,
    approved,
    issuedAt,
    expiresAt,
  });

  return store.saveProximityAttestation({
    attestationId,
    sessionId,
    driverPubkey: session.driverPubkey,
    riderPubkey: riderSessionPubkey,
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
  });
}

function buildAttestationRecord({
  attestationId,
  sessionId,
  driverPubkey,
  riderPubkey,
  driver,
  rider,
  driverTimestamp,
  riderTimestamp,
  distanceMeters,
  timeDeltaMs,
  approved,
  issuedAt,
  expiresAt,
}: {
  attestationId: string;
  sessionId: string;
  driverPubkey: string;
  riderPubkey: string;
  driver: PartyProximityInput;
  rider: PartyProximityInput;
  driverTimestamp: Date;
  riderTimestamp: Date;
  distanceMeters: number;
  timeDeltaMs: number;
  approved: boolean;
  issuedAt: string;
  expiresAt: string;
}) {
  const result: "approved" | "rejected" = approved ? "approved" : "rejected";

  return {
    attestationId,
    sessionId,
    driverPubkey,
    riderPubkey,
    driver: {
      pubkey: driver.pubkey,
      coords: driver.coords,
      clientTimestamp: driverTimestamp.toISOString(),
      receivedAt: issuedAt,
    },
    rider: {
      pubkey: rider.pubkey,
      coords: rider.coords,
      clientTimestamp: riderTimestamp.toISOString(),
      receivedAt: issuedAt,
    },
    distanceMeters,
    timeDeltaMs,
    thresholdMeters: DISTANCE_THRESHOLD_METERS,
    maxTimeDeltaMs: MAX_TIME_DELTA_MS,
    result,
    method: "gps" as const,
    issuedAt,
    expiresAt,
  };
}

export async function getProximityAttestation(attestationId: string) {
  const attestation = await store.getProximityAttestation(attestationId);
  if (!attestation) {
    throw new Error("proximity attestation not found or expired");
  }

  return attestation;
}

export async function requireApprovedProximityAttestation(
  sessionId: string,
  driverPubkey: string,
  riderPubkey: string,
) {
  const attestation = await store.getLatestApprovedProximityAttestation(
    sessionId,
    driverPubkey,
    riderPubkey,
  );

  if (!attestation) {
    throw new Error("approved proximity attestation required");
  }

  return attestation;
}
