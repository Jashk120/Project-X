# Project X

Project X is a Solana-backed identity verification demo with four workspaces:

- `project-x`: Next.js App Router demo client
- `project-x-server`: Fastify API + Socket.IO backend + Anchor client
- `project-x-program`: Anchor on-chain program
- `ProjectXSDK`: separate SDK workspace

The real product boundary is `project-x-server` + `project-x-program`. The Next.js app is a demo/integration client.

## Current Architecture

- Identity bootstrap is browser-local via `localStorage['project_x_keypair']`.
- WebAuthn registration/authentication is backend-mediated and persisted in PostgreSQL.
- Session state and proximity attestations are persisted in PostgreSQL.
- Verify uses one canonical prepared Solana transaction message signed by both parties, then backend countersigns and submits.
- Socket room membership is still in-memory runtime state.

## End-to-End Flow (Current)

1. Browser generates or reuses `project_x_keypair`.
2. WebAuthn registration completes through backend routes.
3. Backend stores the credential and returns a credential hash.
4. Frontend calls `POST /enroll/prepare`, signs locally, then submits via `POST /enroll/submit`.
5. Driver creates or reuses a session.
6. Rider joins that session.
7. Driver completes WebAuthn verify and publishes location.
8. Rider auto-starts verify when driver begins verification, then publishes location.
9. Backend requires BLE presence confirmation tied to rider (`partyB`) before verification.
10. Backend validates WebAuthn signatures + proximity, writes/uses proximity attestation, prepares canonical verify message, collects both signatures, checks submitted `serializeMessage()` bytes exactly match prepared bytes, adds verifier signature, and submits on-chain.

## Workspace Layout

```text
/home/curator/solana
├── project-x
├── project-x-server
├── project-x-program
└── ProjectXSDK
```

## API Surface (Selected)

Base prefix: `/api/v1`

- Solana:
  - `POST /enroll`
  - `POST /enroll/prepare`
  - `POST /enroll/submit`
  - `POST /verify`
  - `POST /revoke`
  - `GET /status`
  - `POST /close`
- Session:
  - `POST /session/create`
  - `POST /session/join`
  - `POST /session/join-by-token`
  - `GET /session/:sessionId`
  - `POST /session/close`
  - `POST /session/presence/issue`
  - `POST /session/presence/confirm`
  - `GET /session/:sessionId/presence`
- WebAuthn:
  - registration begin/complete
  - verification begin/complete

Socket.IO path: `/socket.io`

## Program Notes

- Program ID: `8uGQrehARt9knb4Fs7j15tTVifLwvM56Lre53kYNurTy`
- Default RPC target: devnet
- Main instructions:
  - `enroll`
  - `attest_proximity`
  - `verify`
  - `revoke`
  - `close`
- PDAs:
  - credential: `["credential", owner_pubkey]`
  - proximity: `["proximity", owner_pubkey, rider_pubkey, attestation_nonce_le_bytes]`

## Local Development

### 1) Program

```bash
cd project-x-program
anchor build
anchor test
```

### 2) Server

```bash
cd project-x-server
npm install
npm run dev
```

Required server env:

- `DATABASE_URL`
- `PLATFORM_KEYPAIR`
- `PLATFORM_API_KEY`
- Optional: `SOLANA_RPC` (defaults to devnet)

### 3) Frontend

```bash
cd project-x
npm install
npm run dev
```

Frontend env in use:

- `NEXT_PUBLIC_PROJECT_X_API_URL`
- `NEXT_PUBLIC_PLATFORM_API_KEY`

## Current Working State

- Enrollment uses client-side signing through `enroll/prepare` and `enroll/submit`.
- Driver/rider can share selected preset session IDs (for example `active-trip`, `active-trip-1`, `active-trip-2`).
- Session/WebAuthn/proximity data are PostgreSQL-backed.
- Session join refresh in socket flow re-reads persisted `partyA`/`partyB` to avoid stale in-memory rider mismatch.
- Verify path enforces canonical message-byte matching before countersigning.

## Known Caveats

- Frontend identity is a single browser-local key source (`project_x_keypair`) across register/driver/rider/party flows.
- Same browser profile for driver + rider creates same identity and rider join should fail (`rider pubkey cannot be the same as driver`).
- Prepared enroll/verify records are in-memory on backend; restart drops outstanding prepare IDs.
- Verify prepare expiry currently requires both parties to sign again (no resume flow).
- Socket verification requires BLE presence confirmation before `verify:prepare`.
- Current `driver`/`rider` pages are not yet fully wired to call `/session/presence/issue` and `/session/presence/confirm`.
- Backend has a proximity module, but proximity REST routes are not mounted in `buildApp`.
- Next `/api/users` exists for demo bookkeeping but is not authoritative state.

## Security Caveats

- `PLATFORM_KEYPAIR` remains a high-impact secret.
- On-chain `enroll` does not require owner signature; platform can enroll arbitrary pubkeys.
- CORS and Socket origin policy are permissive for development.

## License

MIT
