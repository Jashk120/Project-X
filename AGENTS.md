# Workspace Context

This workspace contains three related projects:

- `/home/curator/solana/project-x`
- `/home/curator/solana/project-x-server`
- `/home/curator/solana/project-x-program`

Together they implement Project X, a Solana-backed identity verification demo.

## System Summary

Project X is currently split into:

- a Next.js frontend demo app
- a Fastify backend API plus Socket.IO server
- an Anchor program for credential and proximity-attestation state

Product boundary:

- The real product boundary is the backend plus the Anchor program.
- The Next.js app is a demo client and integrator-style reference UI.
- The system is closer to identity infrastructure than to a marketplace app.

Current end-to-end demo flow:

1. A browser-local keypair is generated or reused from `localStorage['project_x_keypair']`.
2. WebAuthn registration completes through the backend.
3. Backend registration completion stores the WebAuthn credential and returns the credential hash.
4. Frontend requests `POST /enroll/prepare`, signs the prepared transaction with the browser-local keypair, and submits it through `POST /enroll/submit`.
5. Driver creates or reuses a backend session.
6. Rider joins that session.
7. Driver completes WebAuthn authentication and shares location.
8. Rider auto-starts WebAuthn authentication when `partyA` begins verification and then shares location.
9. Backend checks both WebAuthn signatures, validates GPS proximity, writes a proximity attestation on Solana if needed, prepares one canonical `verify` transaction, sends the same serialized message to both parties, collects both signatures, verifies that the submitted message bytes exactly match the prepared message bytes, adds the verifier signature, and then submits on-chain verify.

## Current Working State

What is confirmed working now:

- WebAuthn registration succeeds and enrollment now uses client-side signing through `enroll/prepare` and `enroll/submit`.
- Driver and rider can use the same selected session id from the frontend preset list:
  - `active-trip`
  - `active-trip-1`
  - `active-trip-2`
- Sessions are stored in PostgreSQL through Drizzle, not the old file store.
- WebAuthn credentials and challenges are stored in PostgreSQL.
- Proximity attestations are stored in PostgreSQL and consumed by backend/on-chain verification.
- The backend socket room refresh now pulls `partyA` and `partyB` pubkeys from the latest session record on join, so stale in-memory `partyB` state no longer causes false mismatch errors.
- Verify now uses a canonical shared transaction message for both parties instead of backend-only submission.
- Backend countersigning now checks submitted `serializeMessage()` bytes against the prepared canonical message bytes before merging signatures.
- Anchor program tests currently pass.
- Backend TypeScript typecheck currently passes.
- Frontend TypeScript compile currently passes.

Important current caveats:

- The frontend still uses a single browser-local identity source, `project_x_keypair`, across register, driver, rider, and party flows.
- If driver and rider are run in the same browser profile, they become the same identity and rider session join should fail with `rider pubkey cannot be the same as driver`.
- The Next-side `/api/users` store still exists, but the current driver/rider flow no longer depends on it for active session setup.
- Prepared enroll/verify transactions are currently stored in memory on the backend for the demo. A backend restart drops outstanding prepare records.
- Verify prepare expiry currently fails the verification attempt and requires both parties to sign again. There is no resume flow yet.
- Frontend lint is currently failing because of a React hooks rule violation in `app/providers.tsx`.

## Project Map

### Frontend: `/home/curator/solana/project-x`

Purpose:

- Next.js App Router frontend
- demo client for the backend API and Socket.IO flow
- browser-local identity registration and verification UI
- simple session selection UI for the demo

Important files:

`/home/curator/solana/project-x/AGENTS.md`

- Contains a Next.js-specific warning to not rely on stale framework assumptions.

`/home/curator/solana/project-x/app/layout.tsx`

- Root app layout.

`/home/curator/solana/project-x/app/providers.tsx`

- Wraps the app with Solana wallet providers.
- Still uses a mount gate implemented via `setState` inside `useEffect`.
- This currently triggers the frontend lint failure.

`/home/curator/solana/project-x/app/page.tsx`

- Current home page is not the old wallet action page.
- Shows demo links and lets the current browser-local identity revoke or close its credential.
- Reads `project_x_keypair`, not a wallet-adapter identity.

`/home/curator/solana/project-x/app/lib/webauthn.ts`

- Defines `API_BASE_URL`.
- Default fallback is `'/api/v1'`.
- Provides the WebAuthn registration helper used by `/register`.
- Registration completion returns the credential hash used by the follow-up enroll prepare/sign/submit flow.

`/home/curator/solana/project-x/app/lib/project-x-keypair.ts`

- Shared browser-local key handling for Project X.
- Loads `project_x_keypair` from local storage.
- Signs prepared serialized Solana transactions for enroll and verify.

`/home/curator/solana/project-x/app/lib/active-session.ts`

- Defines `ACTIVE_TRIP_ID = 'active-trip'`.
- Exposes:
  - `ensureDriverSession`
  - `joinRiderSession`
  - `closeSession`
  - `getStoredSessionId`
  - `storeSessionId`
- Uses `NEXT_PUBLIC_PLATFORM_API_KEY` for privileged session create/close.
- Current session flow talks to:
  - `POST /session/create`
  - `POST /session/join`
  - `GET /session/:sessionId`
  - `POST /session/close`

`/home/curator/solana/project-x/app/lib/location.ts`

- Reads browser geolocation.
- Surfaces clearer permission, timeout, and unavailable-location errors.

`/home/curator/solana/project-x/app/api/users/route.ts`

- Next.js API route backed by `fs/promises`.
- Stores `{ driver, rider }` in `/home/curator/solana/project-x/data/users.json`.
- Still updated by `/register`, but no longer used by the active driver/rider session logic.

`/home/curator/solana/project-x/app/register/page.tsx`

- Generates or reuses `localStorage['project_x_keypair']`.
- Reads `?role=driver|rider`.
- Calls the WebAuthn registration helper.
- Requests `POST /enroll/prepare`, signs the prepared transaction locally, and submits it through `POST /enroll/submit`.
- Writes the selected role/pubkey into `/api/users` after successful registration.
- Redirects:
  - rider role -> `/rider`
  - otherwise -> `/driver`

`/home/curator/solana/project-x/app/demo/page.tsx`

- Minimal chooser page.
- Provides:
  - `Enroll as Driver`
  - `Enroll as Rider`

`/home/curator/solana/project-x/app/driver/page.tsx`

- Reads the driver identity from `project_x_keypair`.
- Redirects to `/register?role=driver` if no local key exists.
- Checks on-chain credential status through `GET /status`.
- Ensures the selected session exists as `partyA`.
- Joins Socket.IO as `partyA`.
- Runs WebAuthn verification and then emits `driver:thumb` with GPS coordinates.
- Signs the canonical prepared verify transaction when the backend emits `verify:prepare`.
- Supports choosing among preset session ids and resetting the session.

`/home/curator/solana/project-x/app/rider/page.tsx`

- Reads the rider identity from `project_x_keypair`.
- Joins the selected session through `POST /session/join`.
- Joins Socket.IO as `partyB`.
- Auto-starts WebAuthn verification when receiving `driver:verifying` from `partyA`.
- Emits `driver:thumb` as `partyB` with GPS coordinates after successful verification.
- Signs the canonical prepared verify transaction when the backend emits `verify:prepare`.

`/home/curator/solana/project-x/app/party/page.tsx`

- Generic two-party test page.
- Reads `project_x_keypair`.
- Still supports manual `sessionId` and `role` query params.
- Not fully aligned with the newer driver/rider flow.

`/home/curator/solana/project-x/next.config.ts`

- Rewrites:
  - `/api/server/:path*` -> `http://localhost:4575/api/v1/:path*`
  - `/socket.io/:path*` -> `http://localhost:4575/socket.io/:path*`
- Includes current dev origins for LAN/ngrok use.

`/home/curator/solana/project-x/.env`

- Currently sets:
  - `NEXT_PUBLIC_PROJECT_X_API_URL=https://tilt-tiger-recliner.ngrok-free.dev/api/server`
  - `NEXT_PUBLIC_PLATFORM_API_KEY=123456678`

Frontend behavior notes:

- The root page and the driver/rider/register pages all use browser-local identity, not wallet-adapter actions.
- Driver/rider status still depends on exact session pubkey matches as well as on-chain state.
- The frontend still uses prototype-style inline styling.

### Backend: `/home/curator/solana/project-x-server`

Purpose:

- Fastify API server
- Anchor client for Solana transactions and account reads
- Socket.IO coordination layer for the driver/rider demo
- PostgreSQL-backed persistence for WebAuthn, sessions, and proximity attestations

Important files:

`/home/curator/solana/project-x-server/src/server.ts`

- Loads env vars.
- Creates the shared HTTP server.
- Attaches Socket.IO on `/socket.io`.
- Starts Fastify on the same server.

`/home/curator/solana/project-x-server/src/app.ts`

- Builds the Fastify app.
- Registers permissive dev CORS.
- Mounts:
  - solana routes
  - webauthn routes
  - session routes
- Exposes `/health`.
- Does not currently register the proximity REST routes even though that module exists.

`/home/curator/solana/project-x-server/src/config/env.ts`

- Parses env with Zod.
- Required values include:
  - `DATABASE_URL`
  - `PLATFORM_KEYPAIR`
  - `PLATFORM_API_KEY`
- `SOLANA_RPC` defaults to devnet.

`/home/curator/solana/project-x-server/src/config/solana.ts`

- Creates the Solana `Connection`.
- Decodes `PLATFORM_KEYPAIR`.
- Instantiates the Anchor `Program` from the checked-in IDL.
- Uses program id `8uGQrehARt9knb4Fs7j15tTVifLwvM56Lre53kYNurTy`.

`/home/curator/solana/project-x-server/src/db/schema/*`

- Defines PostgreSQL-backed tables for:
  - WebAuthn credentials
  - WebAuthn challenges
  - Sessions
  - Proximity attestations

`/home/curator/solana/project-x-server/src/db/store.ts`

- Main persistence layer for WebAuthn, sessions, and proximity attestations.

`/home/curator/solana/project-x-server/src/modules/solana/solana.routes.ts`

- Declares:
  - `POST /enroll`
  - `POST /enroll/prepare`
  - `POST /enroll/submit`
  - `POST /verify`
  - `POST /revoke`
  - `GET /status`
  - `POST /close`

`/home/curator/solana/project-x-server/src/modules/solana/solana.service.ts`

- Derives:
  - credential PDA from `["credential", owner]`
  - proximity PDA from `["proximity", partyA, partyB, nonce]`
- Prepares enroll and verify transactions for client signing.
- Stores short-lived prepare records in memory for the demo.
- Verifies submitted transaction message bytes against the canonical prepared `serializeMessage()` bytes before countersigning.
- Exposes:
  - `prepareEnroll(subjectPubkey, credentialHashHex)`
  - `submitEnroll(prepareId, signedTransaction)`
  - `prepareVerify(subjectPubkey, riderPubkey, sessionId)`
  - `submitVerifySignature(prepareId, signerPubkey, signedTransaction)`
  - `revoke(subjectPubkey)`
  - `status(subjectPubkey)`
  - `close(subjectPubkey)`

`/home/curator/solana/project-x-server/src/modules/webauthn/webauthn.service.ts`

- Handles WebAuthn registration and authentication.
- Stores WebAuthn credentials and challenges in PostgreSQL.
- Registration completion no longer submits the Solana enroll transaction directly.
- Registration completion returns the credential hash used by the client-side enroll signing flow.
- Verification completion stores session signatures for `partyA` / `partyB`.

`/home/curator/solana/project-x-server/src/modules/session/session.routes.ts`

- Declares:
  - `POST /session/create`
  - `POST /session/join`
  - `GET /session/:sessionId`
  - `POST /session/close`

`/home/curator/solana/project-x-server/src/modules/session/session.service.ts`

- Uses `tripId` as `sessionId`.
- Sessions currently expire after 5 minutes.
- Stores:
  - `driverPubkey`
  - `riderPubkey`
  - `signatures.partyA`
  - `signatures.partyB`

`/home/curator/solana/project-x-server/src/modules/proximity/proximity.service.ts`

- Validates incoming coordinates and timestamps.
- Enforces:
  - 50 meter distance threshold
  - 30 second party-to-party timestamp delta
  - 30 second server receive freshness window
  - 50 meter max reported GPS accuracy
- Stores approved or rejected proximity attestations in PostgreSQL.
- Approved attestations currently live for 60 seconds.

`/home/curator/solana/project-x-server/src/socket/socket.handler.ts`

- Handles:
  - `join`
  - `driver:thumb`
  - `verify:signed`
- Validates the joining pubkey against the persisted session record.
- Maintains in-memory room state.
- Refreshes `partyA` and `partyB` from the current session on join to avoid stale rider state.
- Emits:
  - `party:connected`
  - `driver:verifying`
  - `verify:prepare`
  - `verify:result`
  - `session:error`

Operational notes:

- Backend security still depends heavily on secrecy of `PLATFORM_KEYPAIR`.
- CORS and Socket.IO origin checks are open for development.
- Live room membership is still in-memory only and disappears on server restart.
- PostgreSQL is now authoritative for session and WebAuthn persistence.
- Prepared enroll and verify transaction records are in-memory only for the demo and disappear on server restart.

### Anchor Program: `/home/curator/solana/project-x-program`

Purpose:

- On-chain storage and verification for credentials and proximity attestations.

Important files:

`/home/curator/solana/project-x-program/programs/project-x-program/src/lib.rs`

- Defines handlers for:
  - `enroll`
  - `attest_proximity`
  - `verify`
  - `revoke`
  - `close`

`/home/curator/solana/project-x-program/programs/project-x-program/src/state/credential.rs`

- Defines the `Credential` account:
  - `owner`
  - `platform`
  - `credential_hash`
  - `enrolled_at`
  - `is_active`
  - `bump`

`/home/curator/solana/project-x-program/programs/project-x-program/src/state/proximity_attestation.rs`

- Defines the `ProximityAttestation` account:
  - `owner`
  - `rider`
  - `platform`
  - `session_id_hash`
  - `issued_at`
  - `expires_at`
  - `attestation_nonce`
  - `bump`

`/home/curator/solana/project-x-program/programs/project-x-program/src/error.rs`

- Defines custom errors including:
  - `CredentialInactive`
  - `ProximityAttestationExpired`
  - `OwnerMismatch`
  - `UnauthorizedPlatform`
  - `RiderMismatch`
  - `InvalidProximityAttestation`
  - `SessionMismatch`
  - `InvalidAttestationExpiry`

Instruction summary:

- `enroll`
  - creates the credential PDA
  - stores owner, platform, hash, timestamp, active flag, bump
- `attest_proximity`
  - creates a proximity attestation PDA
  - stores owner, rider, platform, session hash, expiry, nonce, bump
- `verify`
  - requires active credential
  - requires matching owner, rider, platform, session hash, nonce, and unexpired proximity attestation
  - closes the proximity attestation account to the verifier after use
- `revoke`
  - marks the credential inactive
- `close`
  - closes the credential account to the platform signer

PDA summary:

- credential PDA:
  - seeds `["credential", owner_pubkey]`
- proximity PDA:
  - seeds `["proximity", owner_pubkey, rider_pubkey, attestation_nonce_le_bytes]`

## Known Security and Design Caveats

These issues are still present:

- `enroll` does not require owner signature:
  - the platform can enroll any arbitrary pubkey
- The frontend still uses a single browser-local identity key:
  - same-browser driver/rider testing remains unsafe
- The root frontend still exposes revoke and close actions to any browser holding the local pubkey:
  - it is a demo control surface, not a production authorization model
- Live room membership is in-memory only:
  - server restarts drop room presence
- Proximity REST handlers exist in the backend codebase but are not mounted in `buildApp`
- `/api/users` persists local demo selections but is not authoritative system state

## Practical Debugging Notes

When debugging “credential not found”, “not enrolled”, or “pubkey does not match session”, check these in order:

1. Confirm the browser-local `project_x_keypair` matches the identity shown in the relevant page.
2. Confirm the frontend and backend are pointing at the same backend host.
3. Confirm the backend `SOLANA_RPC` cluster matches the explorer/network you are checking.
4. Confirm the backend session record contains the expected `driverPubkey` and `riderPubkey`.
5. Confirm the PostgreSQL WebAuthn credential row exists for the same pubkey that is trying to verify.
6. Confirm the exact browser-local pubkey matches the owner pubkey used for enrollment.
7. If session behavior looks inconsistent, restart the backend and hard-refresh the frontend to clear stale sockets.

Specific current pitfalls:

- “Enrolled on chain” does not imply the browser identity also has a saved WebAuthn credential.
- A previous partial or mismatched local identity can produce:
  - `credential not found`
  - `partyA pubkey does not match session`
  - `partyB pubkey does not match session`
- A verify prepare can expire before both parties sign:
  - `verification request expired; both parties must sign again`
- Driver and rider using the same browser profile still share `project_x_keypair`.
- The generic `/party` page is not fully aligned with the current session/WebAuthn flow and can fail in ways the dedicated driver/rider pages do not.

## Recommended Reading Order

For current frontend behavior:

1. `/home/curator/solana/project-x/app/lib/webauthn.ts`
2. `/home/curator/solana/project-x/app/lib/active-session.ts`
3. `/home/curator/solana/project-x/app/lib/location.ts`
4. `/home/curator/solana/project-x/app/register/page.tsx`
5. `/home/curator/solana/project-x/app/driver/page.tsx`
6. `/home/curator/solana/project-x/app/rider/page.tsx`
7. `/home/curator/solana/project-x/app/party/page.tsx`
8. `/home/curator/solana/project-x/app/page.tsx`
9. `/home/curator/solana/project-x/app/api/users/route.ts`

For backend behavior:

1. `/home/curator/solana/project-x-server/src/server.ts`
2. `/home/curator/solana/project-x-server/src/app.ts`
3. `/home/curator/solana/project-x-server/src/db/store.ts`
4. `/home/curator/solana/project-x-server/src/modules/session/session.service.ts`
5. `/home/curator/solana/project-x-server/src/modules/webauthn/webauthn.service.ts`
6. `/home/curator/solana/project-x-server/src/modules/proximity/proximity.service.ts`
7. `/home/curator/solana/project-x-server/src/modules/solana/solana.service.ts`
8. `/home/curator/solana/project-x-server/src/socket/socket.handler.ts`

For on-chain logic:

1. `/home/curator/solana/project-x-program/programs/project-x-program/src/lib.rs`
2. `/home/curator/solana/project-x-program/programs/project-x-program/src/state/credential.rs`
3. `/home/curator/solana/project-x-program/programs/project-x-program/src/state/proximity_attestation.rs`
4. `/home/curator/solana/project-x-program/docs/codebase-context.md`
