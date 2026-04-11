# Workspace Context

This workspace contains three related projects:

- `/home/curator/solana/project-x`
- `/home/curator/solana/project-x-server`
- `/home/curator/solana/project-x-program`

They together implement Project X, a Solana-backed identity verification demo and infrastructure prototype.

## System Summary

Project X is currently split into:

- a Next.js frontend demo app
- a Fastify backend API and Socket.IO server
- an Anchor program that stores credential state on Solana

Product boundary:

- The real product boundary is the backend API plus the Anchor program.
- The Next.js app is a demo client and example integrator-style frontend.
- Project X should be modeled like identity infrastructure, closer to OAuth than to a rider marketplace app.
- Partner-specific business data should remain outside Project X except where needed to coordinate identity verification.

High-level flow:

1. A subject pubkey is enrolled through the backend.
2. The backend submits `enroll` to the Anchor program using the platform keypair.
3. The frontend can query status and trigger verify, revoke, and close through the backend.
4. The driver/rider demo uses Socket.IO to coordinate a live session.
5. WebAuthn verification and socket-room membership are separate from on-chain enrollment checks.

## Current Working State

What is confirmed working now:

- Enrollment succeeds on Devnet through the backend and creates the on-chain credential PDA.
- The frontend currently uses a single browser-local identity source, `localStorage['project_x_keypair']`, across register, driver, rider, and party flows.
- The Next app has a local users store at `/home/curator/solana/project-x/data/users.json` managed via `GET/POST /api/users`.
- The driver and rider flows both use a fixed session id, `active-trip`.
- The frontend ensures the `active-trip` session exists by calling the existing backend session endpoints through the Next proxy.
- Socket.IO requests are intended to hit Next.js first and then proxy to Fastify via the `/socket.io/*` rewrite.
- The rider page now auto-starts WebAuthn verification when it receives `driver:verifying` from `partyA`, and it ignores the follow-up `partyB` echo to avoid a re-prompt loop.

Important current caveat:

- Because the frontend now uses `project_x_keypair` everywhere, driver and rider become the same identity when run in the same browser profile.

## Project Map

### Frontend: `/home/curator/solana/project-x`

Purpose:

- Next.js App Router frontend
- demo/integrator client for the Project X API
- wallet connection UI for the root page
- browser-local identity registration flow
- driver/rider verification demo UI
- lightweight Next-side storage for selected driver/rider pubkeys

Important files:

`/home/curator/solana/project-x/AGENTS.md`

- Contains a Next.js-specific warning to not rely on stale framework assumptions.

`/home/curator/solana/project-x/app/layout.tsx`

- Root app layout.

`/home/curator/solana/project-x/app/providers.tsx`

- Wraps the app with Solana wallet providers.
- Uses `WalletAdapterNetwork.Devnet`.
- Connects to `clusterApiUrl(network)`.

`/home/curator/solana/project-x/app/page.tsx`

- Main wallet-connected page.
- Uses the wallet-adapter wallet identity, not the browser-local `project_x_keypair`.
- Exposes buttons for:
  - enroll
  - verify
  - revoke
  - close PDA

`/home/curator/solana/project-x/app/lib/webauthn.ts`

- Defines `API_BASE_URL`.
- Current default fallback is `'/api/v1'`, but in practice `.env` sets `NEXT_PUBLIC_PROJECT_X_API_URL`.
- Contains WebAuthn registration helpers.

`/home/curator/solana/project-x/app/lib/active-session.ts`

- Defines `ACTIVE_TRIP_ID = 'active-trip'`.
- Reads `NEXT_PUBLIC_PLATFORM_API_KEY` and throws if it is missing.
- Loads `/api/users`.
- Calls the existing backend session endpoints through the frontend API base:
  - `GET ${API_BASE_URL}/session/active-trip`
  - `POST ${API_BASE_URL}/session/create`

`/home/curator/solana/project-x/app/api/users/route.ts`

- Next.js API route using `fs/promises`.
- Manages `/home/curator/solana/project-x/data/users.json`.
- `GET` returns the full `{ driver, rider }` payload and initializes the file if missing.
- `POST` updates one role at a time atomically.

`/home/curator/solana/project-x/data/users.json`

- Next-side local mapping of selected driver and rider pubkeys.
- Current default shape:
  - `{ "driver": null, "rider": null }`

`/home/curator/solana/project-x/app/register/page.tsx`

- Generates or reuses `localStorage['project_x_keypair']`.
- Enrolls that pubkey through the backend.
- Completes WebAuthn registration.
- Reads `?role=driver|rider` from the URL.
- After successful registration, writes the selected role/pubkey into `/api/users`.
- Redirects:
  - rider role -> `/rider`
  - otherwise -> `/driver`

`/home/curator/solana/project-x/app/demo/page.tsx`

- Minimal chooser page.
- Provides:
  - `Enroll as Driver` -> `/register?role=driver`
  - `Enroll as Rider` -> `/register?role=rider`

`/home/curator/solana/project-x/app/driver/page.tsx`

- Reads the browser-local pubkey from `localStorage['project_x_keypair']`.
- Redirects to `/register?role=driver` if no key exists locally.
- Checks credential status through `${API_BASE_URL}/status`.
- Loads `/api/users` and ensures the `active-trip` backend session exists.
- Joins the socket room as `partyA` with `sessionId: 'active-trip'`.
- Runs WebAuthn verification before emitting `driver:thumb`.
- No longer exposes manual session id input.

`/home/curator/solana/project-x/app/rider/page.tsx`

- Reads the rider pubkey from `localStorage['project_x_keypair']`.
- Loads `/api/users` and ensures the `active-trip` backend session exists.
- Joins the socket room as `partyB` with `sessionId: 'active-trip'`.
- Automatically starts WebAuthn verification when receiving `driver:verifying` from `partyA`.
- Emits `driver:thumb` as `partyB` after successful rider verification.
- No longer exposes manual session id input.

`/home/curator/solana/project-x/app/party/page.tsx`

- Generic two-party test page.
- Now also reads `project_x_keypair` as its browser-local identity source.
- Still supports manual session ids and role switching via query params.

`/home/curator/solana/project-x/next.config.ts`

- Rewrites:
  - `/api/server/:path*` -> `http://localhost:4575/api/v1/:path*`
  - `/socket.io/:path*` -> `http://localhost:4575/socket.io/:path*`
- Includes dev origins for the current LAN/ngrok setup.

`/home/curator/solana/project-x/.env`

- Currently sets:
  - `NEXT_PUBLIC_PROJECT_X_API_URL=https://tilt-tiger-recliner.ngrok-free.dev/api/server`
  - `NEXT_PUBLIC_PLATFORM_API_KEY=123456678`

Frontend behavior notes:

- The frontend still uses prototype-style inline styling.
- The root wallet-connected page and the browser-local register/driver/rider flows still represent different identity models.
- The driver/rider flow depends on both:
  - on-chain enrollment status for the current browser-local pubkey
  - exact backend session pubkey matches for `partyA` and `partyB`

Important debugging note:

- “Enrolled on chain” does not mean “session pubkey matches.” A socket join can still fail with `partyA pubkey does not match session` or `partyB pubkey does not match session` if the stored session expects a different pubkey than the one joining.

### Backend: `/home/curator/solana/project-x-server`

Purpose:

- Fastify API server
- Anchor client for Solana transactions and account reads
- Socket.IO coordination layer for the rider/driver demo
- infrastructure/API layer partner apps would integrate with

Important files:

`/home/curator/solana/project-x-server/src/server.ts`

- Application entrypoint.
- Loads env vars.
- Starts Fastify and Socket.IO on the same HTTP server.

`/home/curator/solana/project-x-server/src/app.ts`

- Builds the Fastify app.
- Registers permissive dev CORS.
- Mounts routes under `/api/v1`.
- Exposes `/health`.

`/home/curator/solana/project-x-server/src/config/env.ts`

- Parses environment variables with Zod.
- Required secret:
  - `PLATFORM_KEYPAIR`
- `SOLANA_RPC` defaults to `https://api.devnet.solana.com`.
- WebAuthn env vars include RP name, RP ID, and allowed origins.

`/home/curator/solana/project-x-server/src/config/solana.ts`

- Creates the Solana `Connection`.
- Decodes `PLATFORM_KEYPAIR`.
- Instantiates the Anchor `Program` client from the checked-in IDL.
- Uses program id `8uGQrehARt9knb4Fs7j15tTVifLwvM56Lre53kYNurTy`.

`/home/curator/solana/project-x-server/src/modules/solana/solana.routes.ts`

- Declares REST endpoints:
  - `POST /enroll`
  - `POST /verify`
  - `POST /revoke`
  - `GET /status`
  - `POST /close`

`/home/curator/solana/project-x-server/src/modules/solana/solana.service.ts`

- Main backend Solana integration layer.
- Derives the credential PDA from `["credential", owner]`.
- Sends Anchor transactions using the server-held `platformKeypair`.
- Exposes:
  - `enroll(subjectPubkey, credentialHash?)`
  - `verify(subjectPubkey, riderPubkey?)`
  - `revoke(subjectPubkey)`
  - `status(subjectPubkey)`
  - `close(subjectPubkey)`

Behavior notes:

- `enroll` uses a placeholder 32-byte hash when no WebAuthn-derived hash is supplied.
- `verify` always calls `program.methods.verify(true)`.
- `riderPubkey` is accepted by the backend but not used in Anchor accounts.
- `status` first checks raw account existence with `connection.getAccountInfo`.
- `status` returns `enrolled: false` only when the PDA account is actually absent.
- `status` throws a concrete error when the PDA exists but Anchor decode/fetch fails.

`/home/curator/solana/project-x-server/src/modules/webauthn/webauthn.service.ts`

- Handles WebAuthn registration begin and complete.
- Derives a credential hash from the WebAuthn credential raw ID.
- Stores WebAuthn credential metadata in the file-backed store.
- Calls backend `enroll()` during registration completion.

`/home/curator/solana/project-x-server/src/modules/session/session.routes.ts`

- Declares:
  - `POST /session/create`
  - `GET /session/:sessionId`
  - `POST /session/close`

`/home/curator/solana/project-x-server/src/modules/session/session.service.ts`

- Uses `tripId` as `sessionId`.
- Sessions expire after 2 hours.
- Stores:
  - `driverPubkey`
  - `riderPubkey`
  - `signatures.partyA`
  - `signatures.partyB`

`/home/curator/solana/project-x-server/src/socket/socket.handler.ts`

- Current socket room orchestration for the frontend demo.
- Handles:
  - `join`
  - `driver:thumb`
- Validates that the joining pubkey exactly matches the session’s expected pubkey for that role.
- Emits:
  - `party:connected`
  - `driver:verifying`
  - `session:error`

Important current behavior:

- `driver:verifying` is broadcast for both `partyA` and `partyB` thumb events.
- The rider page now filters that client-side so it only auto-verifies on `partyA`.
- Session membership is still in-memory and not durable across restarts.

Operational notes:

- Backend security depends heavily on the secrecy of `PLATFORM_KEYPAIR`.
- Session persistence is file-backed, but live socket room state is in-memory only.
- CORS and socket origin policy are fully open in the current dev setup.
- Runtime environment mismatches can still make good on-chain state look broken if the frontend or backend points at the wrong host or wrong RPC.

### Anchor Program: `/home/curator/solana/project-x-program`

Purpose:

- On-chain storage and lifecycle management for credential accounts.

Important files:

`/home/curator/solana/project-x-program/Anchor.toml`

- Anchor workspace config.

`/home/curator/solana/project-x-program/Cargo.toml`

- Rust workspace manifest.

`/home/curator/solana/project-x-program/programs/project-x-program/src/lib.rs`

- Main program file.
- Defines handlers for:
  - `enroll`
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

`/home/curator/solana/project-x-program/programs/project-x-program/src/error.rs`

- Defines custom Anchor errors:
  - `CredentialInactive`
  - `ProximityCheckFailed`
  - `OwnerMismatch`
  - `UnauthorizedPlatform`

`/home/curator/solana/project-x-program/docs/codebase-context.md`

- Detailed program-only context and security notes.

Instruction summary:

- `enroll`
  - creates the credential PDA
  - stores owner, platform, hash, timestamp, active flag, bump
- `verify`
  - checks `is_active`
  - checks caller-provided proximity flag
  - checks `credential.owner == owner.key()`
- `revoke`
  - marks the credential inactive
- `close`
  - closes the credential account to the platform signer

PDA summary:

- seed prefix: `"credential"`
- address derivation: `["credential", owner_pubkey]`

## Known Security and Design Caveats

These issues are still present:

- `verify` trusts caller input:
  - the Anchor program accepts `proximity_verified: bool`
  - the backend hardcodes it to `true`
- `enroll` does not require owner signature:
  - the platform can enroll any arbitrary pubkey
- Socket verification is weaker than the on-chain `verify` instruction:
  - the live demo still depends on socket/WebAuthn coordination
  - it does not force a fresh on-chain verification transaction for each room event
- WebAuthn registration and on-chain enrollment are still loosely coupled:
  - the frontend enrolls before WebAuthn complete
  - backend registration complete also performs enrollment logic
- The Next-side users store is local to the frontend filesystem and is not authoritative infrastructure state

## Practical Debugging Notes

When debugging “enrolled on chain but UI says not enrolled” or “pubkey does not match session”, check these in order:

1. Confirm the frontend is using the expected browser-local pubkey from `project_x_keypair`.
2. Confirm `/home/curator/solana/project-x/data/users.json` contains the expected `driver` and `rider` values.
3. Confirm the backend session for `active-trip` contains the same `driverPubkey` and `riderPubkey`.
4. Confirm the backend `SOLANA_RPC` cluster matches the explorer cluster.
5. Confirm the exact browser-local pubkey matches the owner pubkey in the enroll transaction.
6. Check backend logs for `404` versus real `status()` or session errors.

Specific known pitfalls:

- A socket join failure with `partyA pubkey does not match session` or `partyB pubkey does not match session` is a session identity mismatch, not proof that on-chain enrollment failed.
- Using the same browser profile for both driver and rider now means both roles share `project_x_keypair`.
- If Next.js or the browser is stale, Socket.IO behavior can appear inconsistent until the Next dev server is restarted and the browser is hard-refreshed.

## Recommended Reading Order

For current frontend behavior:

1. `/home/curator/solana/project-x/app/lib/webauthn.ts`
2. `/home/curator/solana/project-x/app/api/users/route.ts`
3. `/home/curator/solana/project-x/app/lib/active-session.ts`
4. `/home/curator/solana/project-x/app/register/page.tsx`
5. `/home/curator/solana/project-x/app/driver/page.tsx`
6. `/home/curator/solana/project-x/app/rider/page.tsx`
7. `/home/curator/solana/project-x/app/demo/page.tsx`
8. `/home/curator/solana/project-x/app/party/page.tsx`
9. `/home/curator/solana/project-x/app/page.tsx`

For backend behavior:

1. `/home/curator/solana/project-x-server/src/server.ts`
2. `/home/curator/solana/project-x-server/src/app.ts`
3. `/home/curator/solana/project-x-server/src/modules/session/session.service.ts`
4. `/home/curator/solana/project-x-server/src/modules/solana/solana.service.ts`
5. `/home/curator/solana/project-x-server/src/modules/webauthn/webauthn.service.ts`
6. `/home/curator/solana/project-x-server/src/socket/socket.handler.ts`

For on-chain logic:

1. `/home/curator/solana/project-x-program/programs/project-x-program/src/lib.rs`
2. `/home/curator/solana/project-x-program/programs/project-x-program/src/state/credential.rs`
3. `/home/curator/solana/project-x-program/docs/codebase-context.md`
