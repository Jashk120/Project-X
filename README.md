# Project X

Project X is a Solana-backed identity verification demo composed of:

- `project-x` (Next.js demo client)
- `project-x-server` (Fastify + Socket.IO backend)
- `project-x-program` (Anchor program)
- `ProjectXSDK` (separate SDK workspace in this repo)

The product boundary is primarily `project-x-server` + `project-x-program`. The frontend is a demo/integration client.

## Current System Flow

1. Browser creates/reuses a local keypair at `localStorage['project_x_keypair']`.
2. WebAuthn registration runs through backend (`/webauthn/register/*`).
3. Backend stores WebAuthn credential and returns credential hash.
4. Frontend calls `/enroll/prepare`, signs with local keypair, then `/enroll/submit`.
5. Driver creates/reuses a session (`/session/create`).
6. Rider joins session (`/session/join`).
7. Driver and rider both complete WebAuthn authentication and share GPS.
8. Backend requires BLE presence confirmation for rider in the session.
9. Backend validates both signatures + proximity, prepares one canonical verify tx, both parties sign, backend countersigns and submits on-chain verify.

## Workspace Layout

```text
/home/curator/solana
├── project-x                 # Next.js demo UI/client
├── project-x-server          # Fastify API + Socket.IO + DB + Anchor client
├── project-x-program         # Anchor on-chain program
└── ProjectXSDK               # SDK workspace
```

## Backend API (selected)

Base prefix: `/api/v1`

- Solana routes:
  - `POST /enroll`
  - `POST /enroll/prepare`
  - `POST /enroll/submit`
  - `POST /verify`
  - `POST /revoke`
  - `GET /status`
  - `POST /close`
- Session routes:
  - `POST /session/create`
  - `POST /session/join`
  - `POST /session/join-by-token`
  - `GET /session/:sessionId`
  - `POST /session/close`
  - `POST /session/presence/issue`
  - `POST /session/presence/confirm`
  - `GET /session/:sessionId/presence`
- WebAuthn routes:
  - register begin/complete
  - verify begin/complete

Socket.IO path: `/socket.io`

## Program

- Program ID: `8uGQrehARt9knb4Fs7j15tTVifLwvM56Lre53kYNurTy`
- Network: Solana devnet (default)
- Main instructions:
  - `enroll`
  - `attest_proximity`
  - `verify`
  - `revoke`
  - `close`

## Run Locally

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

Required env (server):

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

## Current Caveats

- Frontend uses one browser-local identity (`project_x_keypair`) across driver/rider/register flows.
- Same browser profile for driver+rider will fail rider join (`rider pubkey cannot be the same as driver`).
- Prepared enroll/verify transactions are kept in-memory on backend; restart drops outstanding prepare records.
- Verify prepare expiry requires both parties to sign again.
- Room presence is in-memory in Socket.IO state.
- `/api/users` in Next app still exists for demo bookkeeping; it is not authoritative.
- Socket verify path now requires BLE presence confirmation; current driver/rider pages are not fully wired to presence issue/confirm endpoints.

## License

MIT
