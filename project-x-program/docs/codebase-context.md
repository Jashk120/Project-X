# Project X Anchor Program Context

## Scope

This document covers the Anchor workspace in `/home/curator/solana/project-x-program`.
It describes the purpose of each relevant file, how the on-chain program is structured, and the main security observations from the code review.

## Workspace Overview

The workspace is a small Anchor project with one on-chain program:

- Workspace root: `/home/curator/solana/project-x-program`
- Program crate: `/home/curator/solana/project-x-program/programs/project-x-program`
- Program name: `project_x_program`
- Declared program id: `8uGQrehARt9knb4Fs7j15tTVifLwvM56Lre53kYNurTy`

The project stores a single PDA-backed account type called `Credential`. The account is derived from:

```text
["credential", owner_pubkey]
```

The current instruction set is:

- `enroll`
- `verify`
- `revoke`
- `close`

## Directory Map

### Root configuration

`/home/curator/solana/project-x-program/Anchor.toml`

- Anchor workspace configuration.
- Binds the localnet program id for `project_x_program`.
- Sets the provider cluster to `localnet`.
- Configures `cargo test` as the test script.

`/home/curator/solana/project-x-program/Cargo.toml`

- Cargo workspace manifest.
- Includes all crates under `programs/*`.
- Enables release profile settings such as overflow checks and LTO.

`/home/curator/solana/project-x-program/Cargo.lock`

- Lockfile for Rust dependencies.

`/home/curator/solana/project-x-program/rust-toolchain.toml`

- Pins Rust toolchain `1.89.0`.
- Enables `rustfmt` and `clippy`.

`/home/curator/solana/project-x-program/package.json`

- JavaScript tooling manifest for the Anchor workspace.
- Includes formatting scripts via Prettier.
- Includes `@anchor-lang/core` and test-related TypeScript packages.

`/home/curator/solana/project-x-program/yarn.lock`

- Lockfile for JS dependencies.

`/home/curator/solana/project-x-program/.gitignore`

- Standard ignore rules for local build and dependency output.

### Deployment script

`/home/curator/solana/project-x-program/migrations/deploy.ts`

- Minimal Anchor deploy hook.
- Sets the Anchor provider and leaves deployment customization empty.
- Currently does not perform post-deploy initialization.

### Program crate

`/home/curator/solana/project-x-program/programs/project-x-program/Cargo.toml`

- Rust manifest for the on-chain program crate.
- Declares crate name `project_x_program`.
- Includes `anchor-lang = "1.0.0"`.
- Includes dev dependencies for `litesvm` and Solana test tooling.

`/home/curator/solana/project-x-program/programs/project-x-program/src/lib.rs`

- Main program entrypoint.
- Declares the program id.
- Defines the `Accounts` structs for every instruction.
- Implements all four instructions:
  - `enroll`: creates and initializes a `Credential` PDA
  - `verify`: checks `is_active`, accepts a caller-provided proximity flag, and logs success
  - `revoke`: marks the credential inactive
  - `close`: closes the credential account and returns lamports to `platform`

This is the most important file in the codebase because it contains both the business logic and the account validation rules.

`/home/curator/solana/project-x-program/programs/project-x-program/src/error.rs`

- Defines custom program errors:
  - `CredentialInactive`
  - `ProximityCheckFailed`
  - `OwnerMismatch`
  - `UnauthorizedPlatform`

`/home/curator/solana/project-x-program/programs/project-x-program/src/constants.rs`

- Defines a single constant `SEED = "anchor"`.
- This constant is not used by the current program logic.

`/home/curator/solana/project-x-program/programs/project-x-program/src/state/mod.rs`

- Re-exports the state module(s).
- Currently only exposes `credential`.

`/home/curator/solana/project-x-program/programs/project-x-program/src/state/credential.rs`

- Defines the only persistent on-chain account: `Credential`.
- Fields:
  - `owner: Pubkey`
  - `platform: Pubkey`
  - `credential_hash: [u8; 32]`
  - `enrolled_at: i64`
  - `is_active: bool`
  - `bump: u8`
- Also defines `Credential::LEN`, the allocated account size including discriminator.

### Tests

`/home/curator/solana/project-x-program/programs/project-x-program/tests/test_initialize.rs`

- Basic LiteSVM smoke test.
- Creates `platform` and `owner` keypairs.
- Airdrops SOL to the platform.
- Derives the credential PDA.
- Prints test values.

Important limitation: this test does not submit real program instructions and does not check failure cases or malicious account combinations.

### Generated artifacts

`/home/curator/solana/project-x-program/target/types/project_x_program.ts`

- Generated TypeScript type definitions derived from the program IDL.
- Useful for TS clients and for confirming the exposed instruction/account layout.

`/home/curator/solana/project-x-program/target/...`

- Cargo and Anchor build output.
- Not hand-maintained source.

## Instruction Model

### `enroll`

Defined in:

- `/home/curator/solana/project-x-program/programs/project-x-program/src/lib.rs`

Purpose:

- Creates a `Credential` PDA for a given `owner`.
- Stores the owner, enrolling platform, credential hash, enrollment timestamp, active flag, and bump.

Accounts:

- `credential`: PDA initialized at `["credential", owner.key()]`
- `owner`: unchecked account used only as a pubkey source
- `platform`: signer and payer
- `system_program`

Notes:

- The PDA namespace is one credential per owner pubkey.
- The owner does not sign this instruction.

### `verify`

Purpose:

- Reads a credential PDA and checks whether it is active.
- Requires a caller-supplied `proximity_verified` boolean.
- Confirms `credential.owner == owner.key()`.
- Logs success if checks pass.

Accounts:

- `credential`: PDA at `["credential", owner.key()]`
- `owner`: unchecked account
- `verifier`: arbitrary signer

Notes:

- The instruction does not mutate state.
- The verification outcome depends partly on an untrusted boolean argument.

### `revoke`

Purpose:

- Sets `credential.is_active = false`.

Accounts:

- `credential`: mutable PDA at `["credential", owner.key()]`
- `owner`: unchecked account
- `platform`: signer constrained to equal `credential.platform`

Notes:

- Only the enrolling platform can revoke.

### `close`

Purpose:

- Closes the credential PDA and returns lamports to `platform`.

Accounts:

- `credential`: mutable PDA at `["credential", owner.key()]`
- `owner`: unchecked account
- `platform`: signer constrained to equal `credential.platform`

Notes:

- The handler body is empty because the close behavior is enforced by the Anchor account attribute.

## Account Relationships

### `Credential`

The main stored invariants are:

- `owner` is the wallet the credential is associated with.
- `platform` is the signer that created the credential.
- `credential_hash` is intended to represent an off-chain biometric proof hash.
- `is_active` gates verification.

### PDA derivation

Every credential is derived from the owner pubkey:

```text
credential_pda = PDA(["credential", owner_pubkey], program_id)
```

That means:

- each owner has at most one credential account in the current design
- the platform is stored inside the account, not in the seed
- different platforms cannot create separate credentials for the same owner under the current address scheme

## Security Review Context

### Re-entrancy assessment

No meaningful re-entrancy issue is present in the current code.

Reason:

- there are no outbound CPIs in the program logic
- Solana does not have EVM-style fallback re-entry behavior
- the handlers mostly read or directly mutate one account and return

If future versions add CPIs before state updates, the program should be re-reviewed.

### Account validation and authorization findings

#### 1. `verify` trusts unverified instruction data

Severity: High

The `verify` instruction accepts `proximity_verified: bool` directly from the caller. That means any caller can choose `true` and satisfy the proximity check without proving anything on-chain.

Why it matters:

- if an off-chain system treats a successful instruction or log event as proof of verification, the caller can self-authorize
- `verifier` is only constrained to be a signer, not a trusted authority or attestation source

Relevant file:

- `/home/curator/solana/project-x-program/programs/project-x-program/src/lib.rs`

#### 2. `enroll` does not require owner consent

Severity: Medium

The `owner` account in `enroll` is an `UncheckedAccount`, not a signer. The enrolling platform can therefore create a credential PDA for any arbitrary wallet address.

Why it matters:

- a platform can enroll someone without their approval
- because the PDA seed uses only the owner pubkey, this can also preempt the namespace for that owner

Relevant file:

- `/home/curator/solana/project-x-program/programs/project-x-program/src/lib.rs`

#### 3. Account relationship checks are implicit rather than explicit

Severity: Low

`Verify`, `Revoke`, and `Close` rely on PDA derivation through the passed `owner` account, but they do not consistently enforce `credential.owner == owner.key()` in account constraints.

Why it matters:

- the current logic still works because `credential.owner` is set at creation and never changed
- however, this is brittle and easy to weaken accidentally in future refactors

Relevant file:

- `/home/curator/solana/project-x-program/programs/project-x-program/src/lib.rs`

## Testing Context

Current testing is minimal.

What exists:

- one LiteSVM smoke test that derives a PDA and prints values

What is missing:

- negative tests for invalid signers
- tests for unauthorized verification attempts
- tests for unauthorized revoke/close attempts
- tests proving that owner-consent assumptions hold or do not hold

## Operational Notes

- There is no root README in `/home/curator/solana/project-x-program` at the moment.
- `constants.rs` contains an unused constant and appears to be leftover scaffold code.
- The generated TS type file in `target/types` is useful for client integration but should be treated as generated output, not source of truth.

## Suggested Reading Order

If someone is new to this codebase, the fastest order is:

1. `/home/curator/solana/project-x-program/programs/project-x-program/src/lib.rs`
2. `/home/curator/solana/project-x-program/programs/project-x-program/src/state/credential.rs`
3. `/home/curator/solana/project-x-program/programs/project-x-program/src/error.rs`
4. `/home/curator/solana/project-x-program/Anchor.toml`
5. `/home/curator/solana/project-x-program/programs/project-x-program/tests/test_initialize.rs`

That sequence gives the program behavior first, then the data model, then errors, then workspace configuration, then current test coverage.
