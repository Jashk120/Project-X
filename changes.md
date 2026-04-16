# Current State And Remaining Changes

## Current Anchor State

The Anchor program has already been updated in:

- `/home/curator/solana/project-x-program/programs/project-x-program/src/lib.rs`
- `/home/curator/solana/project-x-program/programs/project-x-program/src/error.rs`
- `/home/curator/solana/project-x-program/programs/project-x-program/src/state/proximity_attestation.rs`

Completed changes:

- `Enroll.owner` is now `Signer<'info>`.
- `Verify` now uses generic infrastructure naming:
  - `party_a: Signer<'info>`
  - `party_b: Signer<'info>`
  - `verifier: Signer<'info>`
- `AttestProximity` now uses generic account names:
  - `party_a`
  - `party_b`
- `ProximityAttestation` state now stores:
  - `party_a`
  - `party_b`
- Proximity PDA seeds now use:
  - `["proximity", party_a, party_b, attestation_nonce]`
- `Credential.owner` and `Enroll.owner` intentionally remain named `owner` because enrollment is ownership of an identity credential.
- `revoke` and `close` remain platform-controlled for now.

Validation already run:

```bash
cd /home/curator/solana/project-x-program
NO_DNA=1 cargo test
```

Result:

- passed
- existing warning remains for an unused `Transaction` import in the Rust test file

## Current Integration State

Implemented since the Anchor signer change:

- backend local runtime IDL has been patched to reflect:
  - `enroll.owner` signer
  - `verify.party_a` signer
  - `verify.party_b` signer
  - `attest_proximity.party_a`
  - `attest_proximity.party_b`
- backend now uses:
  - `POST /enroll/prepare`
  - `POST /enroll/submit`
- frontend register flow now signs the prepared enroll transaction with `project_x_keypair`
- backend verify now uses one canonical prepared transaction shared with both parties
- both parties sign the same prepared verify message in parallel
- backend compares the submitted `serializeMessage()` bytes byte-for-byte against the prepared canonical message bytes before countersigning
- verify prepare expiry now clears in-memory state and emits:
  - `verification request expired; both parties must sign again`

Still intentionally true:

- direct `POST /enroll` is rejected
- direct `POST /verify` is rejected
- prepare records are still in-memory only for the demo

## Remaining Work

### 1. Regenerate Anchor IDL And Types

Required because account names and signer constraints changed.

Run from:

```bash
cd /home/curator/solana/project-x-program
```

Needed outputs:

- rebuilt Anchor IDL
- updated generated TypeScript program type used by the backend:
  - `/home/curator/solana/project-x-server/src/types/project_x_program.ts`

Expected IDL changes:

- `enroll.owner` has `signer: true`
- `verify.partyA` has `signer: true`
- `verify.partyB` has `signer: true`
- `attestProximity` accounts are `partyA` and `partyB`
- `ProximityAttestation` fields are `partyA` and `partyB`

### 2. Regenerate Backend Program Types Cleanly

File:

- `/home/curator/solana/project-x-server/src/types/project_x_program.ts`

Current status:

- runtime works from the patched local IDL at:
  - `/home/curator/solana/project-x-server/src/idl/project_x_program.json`
- the checked-in generated TypeScript type file is still stale and should be regenerated from Anchor output

### 3. Persist Prepare Records If Needed

Current status:

- prepare records for enroll and verify are held in memory in the backend
- this is acceptable for the current demo but not durable

Remaining improvement:

- move prepare records into PostgreSQL if restart tolerance or better observability is needed

### 4. Improve Verify Recovery Flow If Needed

Current status:

- verify already uses one canonical prepared transaction
- both parties sign in parallel
- expiry cleans up room state and forces a retry

Remaining improvement:

- fail fast on disconnect instead of waiting only for expiry
- optionally add a resume or re-prepare handshake instead of only emitting failure

### 5. Keep Tight Validation On Countersign

Already implemented:

- backend must not countersign arbitrary client-supplied transactions
- submitted `serializeMessage()` bytes are compared byte-for-byte against the prepared canonical message bytes before merge or countersigning

Validation still expected to remain in place:

- expected program id
- expected instruction discriminator
- expected account metas
- expected signer pubkeys
- expected writable accounts
- expected `owner` for enrollment
- expected `partyA` and `partyB` for verification
- expected credential PDA
- expected proximity PDA
- expected session hash
- expected attestation nonce
- recent blockhash policy
- no extra instructions unless explicitly allowed

Do not relax this for convenience.

### 6. Bind WebAuthn Challenges To Transaction Intent

Current WebAuthn flow proves presence/authentication to the backend.

It should also bind the authorization to the exact state transition.

Enrollment challenge should bind at least:

- `owner`
- `platform`
- `credential_hash`
- credential PDA

Verification challenge should bind at least:

- `partyA`
- `partyB`
- `platform`
- `session_id_hash`
- `attestation_nonce`
- proximity PDA
- expiration/freshness metadata

This prevents a valid biometric authentication from being reused for a different transaction intent.

### 7. Refine Prepared Transaction Expiry Handling

Prepared transactions depend on a fresh blockhash, and verify signatures cannot be reused across a refreshed message.

Backend should track short-lived prepare records with:

- prepare id
- owner or party pubkeys
- instruction type
- expected message hash
- recent blockhash
- expiration timestamp
- consumed/submitted status

Storage can be PostgreSQL.

This supports:

- retry after expired blockhash
- abandoned prepare cleanup
- idempotent submit handling
- tamper detection

Current demo policy:

- use a normal recent blockhash
- use short-lived prepare records
- if the prepare expires, require a fresh prepare and both signatures again

Durable nonce option:

- consider only if the two-party signing window is expected to exceed recent blockhash lifetime often
- adds extra nonce account management and transaction complexity
- still requires strict validation that both parties signed the exact nonce-backed message

This is acceptable for the current demo.

### 8. Improve Frontend UX Around Signing And Expiry

Files:

- `/home/curator/solana/project-x/app/lib/webauthn.ts`
- `/home/curator/solana/project-x/app/register/page.tsx`

Current frontend:

- generates or reuses `localStorage['project_x_keypair']`
- completes WebAuthn registration
- expects backend registration completion to enroll on-chain

Current status:

- register flow signs prepared enroll transactions
- driver and rider sign prepared verify transactions

Remaining improvement:

- show clearer UI when verify prepare expires
- show clearer UI when a party signs late against an expired prepare

### 9. Keep Same-Browser Identity Caveat Visible

Files:

- `/home/curator/solana/project-x/app/driver/page.tsx`
- `/home/curator/solana/project-x/app/rider/page.tsx`

Current status:

- same-browser driver/rider still shares `project_x_keypair`
- rider join should fail with `rider pubkey cannot be the same as driver`

Keep testing guidance explicit:

- use separate devices or separate browser profiles for driver and rider

### 10. Decide Revoke Policy

Still unchanged:

- `revoke` is platform-only
- `close` is platform-only

Decision needed:

- keep platform-only revoke
- allow owner-only self-revoke
- require owner plus platform
- allow either owner or platform to revoke

Recommended policy:

- owner can revoke active status
- platform can close the rent-bearing account

This was not implemented in the Anchor-only change.

### 11. Add Program Tests

Current Rust test coverage is very light.

Add tests proving:

- `enroll` fails without `owner` signature
- `enroll` succeeds with `owner` and `platform`
- platform cannot enroll an arbitrary third-party pubkey without that pubkey signing
- `verify` fails without `partyA` signature
- `verify` fails without `partyB` signature
- `verify` succeeds with `partyA`, `partyB`, and `verifier`
- `verify` fails if `partyA` does not match credential owner
- `verify` fails if `partyB` does not match proximity attestation

Likely test path:

- `/home/curator/solana/project-x-program/programs/project-x-program/tests/*`

### 12. Add Backend Tests

Add tests proving:

- prepare returns the expected transaction
- submit rejects message bytes that differ from the prepared canonical message bytes
- submit rejects tampered program id
- submit rejects tampered account metas
- submit rejects wrong owner or party signer
- submit rejects stale blockhash or expired prepare state
- backend does not countersign a message that differs from the prepared intent
- verify prepare cannot be created before both WebAuthn signatures and proximity approval exist

### 13. Add Client Tests

Add tests proving:

- registration signs and submits the prepared enrollment transaction
- verify signing round trip works for both parties
- expired prepare state retries cleanly
- same-browser same-key driver/rider flow produces a clear failure

## Product Semantics After Current Demo Flow

With the current demo flow:

- the platform cannot enroll a user without the user's `owner` signature
- the platform cannot fabricate a completed two-party verification without both `partyA` and `partyB` signatures
- WebAuthn/device auth proves local presence and should gate access to the signing key
- the Solana transaction signature is the durable authorization artifact
- proximity evidence should remain off-chain unless there is a specific public audit requirement

## Recommended Next Steps From Here

1. Regenerate Anchor IDL and backend program types.
2. Add focused backend tests for canonical message matching and expired prepares.
3. Add focused frontend tests around enroll and verify signing.
4. Decide whether prepare records should move from memory to PostgreSQL.
5. Decide and implement revoke policy if needed.

## Bottom Line

The signer-based demo integration is in place:

- enroll uses client signing
- verify uses canonical shared-message signing by both parties
- backend compares exact prepared message bytes before countersigning

Remaining work is mostly cleanup, testing, and hardening.
