# Project X — Physical World Identity Infrastructure

> **OAuth for the physical world, powered by Solana**

*Colosseum Frontier Hackathon 2026*

---

## The Problem

Every day millions of people get into cars with strangers. The current verification system is broken:

- OTP proves phone possession, not identity
- A driver can send his brother with his phone — undetectable
- Verification is locked to one platform, no portability
- Platform breaches expose millions of identities
- No real-time physical presence check

## The Solution

Project X is an identity infrastructure layer. Not an app. Not a platform. An on-chain credential system that any physical-world platform can integrate to gate high-trust interactions behind verified identity.

**Enroll once. Verify everywhere. No company owns your identity.**

```
Enroll  → biometric captured, ZK proof generated, credential written to Solana
Verify  → credential checked + proximity gated (must be within 50m)
Revoke  → platform deactivates credential across all integrated platforms
```

---

## Monorepo Structure

```
project-x/
├── project-x-program/     # Anchor smart contract (Rust)
│   └── programs/
│       └── project-x-program/
│           └── src/
│               ├── lib.rs          # Program entry + instructions
│               ├── state/          # Credential account struct
│               └── error.rs        # Custom error codes
└── project-x/             # Next.js frontend
    └── app/
        ├── page.tsx        # Main UI (enroll / verify / revoke)
        ├── providers.tsx   # Solana wallet provider
        └── idl/            # Anchor IDL (auto-generated)
```

---

## Smart Contract

**Program ID:** `8uGQrehARt9knb4Fs7j15tTVifLwvM56Lre53kYNurTy`  
**Network:** Solana Devnet  
**Framework:** Anchor 1.0.0

### Instructions

| Instruction | Who pays | What it does |
|-------------|----------|--------------|
| `enroll` | Platform | Creates credential PDA for a user, stores biometric hash |
| `verify` | Verifier | Checks credential is active + proximity flag |
| `revoke` | Platform | Sets `is_active = false`, blocks all future verifies |

### Credential Account (PDA)

```rust
seeds = ["credential", owner_pubkey]

pub struct Credential {
    pub owner: Pubkey,             // user's wallet
    pub platform: Pubkey,          // platform that enrolled them
    pub credential_hash: [u8; 32], // SHA-256 of biometric proof
    pub enrolled_at: i64,          // unix timestamp
    pub is_active: bool,
    pub bump: u8,
}
```

### Why Solana is load-bearing

- **Portability** — one credential works across Uber, Rapido, Ola. No single company owns it.
- **Audit trail** — every verify call is an immutable on-chain transaction
- **Neutral substrate** — open standard, anyone can read credentials for free
- **Cost** — 500k driver enrollments ≈ $125 total. Reads are free.

---

## Getting Started

### Prerequisites

```bash
# Required
rustc >= 1.94
solana-cli >= 3.1
anchor-cli >= 1.0.0
node >= 20
```

### Smart Contract

```bash
cd project-x-program

# Build
anchor build

# Run tests
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

### Frontend

```bash
cd project-x

# Install dependencies
npm install

# Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), connect Phantom wallet (set to Devnet), and use the Enroll / Verify / Revoke buttons.

---

## Roadmap

| Week | Milestone |
|------|-----------|
| 1 | ✅ Anchor program deployed, enroll/verify/revoke working |
| 2 | ✅ Next.js frontend, Phantom wallet, full flow on devnet |
| 3 | WebAuthn biometric integration, real fingerprint hash |
| 4 | QR code scan flow, two-platform portability demo |
| 5 | Mobile testing, UI polish, end-to-end demo |

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Smart contract | Anchor (Rust), Solana |
| Frontend | Next.js 15, TypeScript, Tailwind |
| Wallet | Phantom, `@solana/wallet-adapter` |
| Biometric (upcoming) | WebAuthn (device secure enclave) |
| Proximity (upcoming) | Browser Geolocation API |

---

## License

MIT
