import { createHash } from "node:crypto";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { connection, program, platformKeypair, PROGRAM_ID } from "../../config/solana";
import { getSession } from "../session/session.service";
import { requireApprovedProximityAttestation } from "../proximity/proximity.service";

export function getCredentialPDA(ownerPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("credential"), ownerPubkey.toBuffer()],
    PROGRAM_ID
  );
}

export function getProximityAttestationPDA(
  ownerPubkey: PublicKey,
  riderPubkey: PublicKey,
  attestationNonce: BN,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("proximity"),
      ownerPubkey.toBuffer(),
      riderPubkey.toBuffer(),
      attestationNonce.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_ID,
  );
}

export function parsePublicKey(key: string, label = "publicKey"): PublicKey {
  try {
    return new PublicKey(key);
  } catch {
    throw new Error(`invalid ${label}`);
  }
}

function hashSessionId(sessionId: string): Buffer {
  return createHash("sha256").update(sessionId).digest();
}

function getAttestationNonce(attestationId: string): BN {
  const hash = createHash("sha256").update(attestationId).digest();
  return new BN(hash.subarray(0, 8), "le");
}

// ------- enroll -------
// platform signs + pays, owner is the subject (driver)
export async function enroll(
  subjectPubkey: string,
  credentialHash: Buffer = Buffer.alloc(32, 1),
) {
  const ownerKey = parsePublicKey(subjectPubkey, "subjectPubkey");
  const [credentialPda] = getCredentialPDA(ownerKey);

  if (credentialHash.length !== 32) {
    throw new Error("credentialHash must be 32 bytes");
  }

  const tx = await program.methods
    .enroll(Array.from(credentialHash))
    .accounts({
      credential: credentialPda,
      owner: ownerKey,
      platform: platformKeypair.publicKey,
      systemProgram: new PublicKey("11111111111111111111111111111111"),
    } as any)
    .signers([platformKeypair])
    .rpc();

  return {
    success: true,
    tx,
    credentialPda: credentialPda.toString(),
    owner: ownerKey.toString(),
    platform: platformKeypair.publicKey.toString(),
  };
}

// ------- verify -------
// server signs as verifier
// riderPubkey is passed by caller for their own records — not used in Anchor accounts
// because verifier is a Signer and that's the platform keypair here
export async function verify(
  subjectPubkey: string,
  riderPubkey?: string,
  sessionId?: string,
) {
  if (!sessionId || !riderPubkey) {
    throw new Error("session-backed verify requires both sessionId and riderPubkey");
  }

  const ownerKey = parsePublicKey(subjectPubkey, "subjectPubkey");
  const riderKey = parsePublicKey(riderPubkey, "riderPubkey");
  const [credentialPda] = getCredentialPDA(ownerKey);

  const session = await getSession(sessionId);
  if (session.driverPubkey !== subjectPubkey) {
    throw new Error("subjectPubkey does not match session driver");
  }

  if (session.riderPubkey !== riderPubkey) {
    throw new Error("riderPubkey does not match session rider");
  }

  const attestation = await requireApprovedProximityAttestation(
    sessionId,
    subjectPubkey,
    riderPubkey,
  );
  const sessionIdHash = hashSessionId(sessionId);
  const attestationNonce = getAttestationNonce(attestation.attestationId);
  const expiresAtSeconds = Math.floor(
    new Date(attestation.expiresAt).getTime() / 1000,
  );
  const [proximityAttestationPda] = getProximityAttestationPDA(
    ownerKey,
    riderKey,
    attestationNonce,
  );

  const proximityAccount = await connection.getAccountInfo(proximityAttestationPda);
  if (!proximityAccount) {
    await program.methods
      .attestProximity(
        Array.from(sessionIdHash),
        attestationNonce,
        new BN(expiresAtSeconds),
      )
      .accounts({
        proximityAttestation: proximityAttestationPda,
        owner: ownerKey,
        rider: riderKey,
        platform: platformKeypair.publicKey,
        systemProgram: new PublicKey("11111111111111111111111111111111"),
      } as any)
      .signers([platformKeypair])
      .rpc();
  }

  const tx = await program.methods
    .verify(Array.from(sessionIdHash), attestationNonce)
    .accounts({
      proximityAttestation: proximityAttestationPda,
      credential: credentialPda,
      owner: ownerKey,
      rider: riderKey,
      verifier: platformKeypair.publicKey,
    } as any)
    .signers([platformKeypair])
    .rpc();

  return {
    success: true,
    tx,
    credentialPda: credentialPda.toString(),
    owner: ownerKey.toString(),
    verifiedBy: platformKeypair.publicKey.toString(),
    proximityAttestationId: attestation.attestationId,
    proximityAttestationPda: proximityAttestationPda.toString(),
  };
}

// ------- revoke -------
// platform must match credential.platform stored at enroll time
export async function revoke(subjectPubkey: string) {
  const ownerKey = parsePublicKey(subjectPubkey, "subjectPubkey");
  const [credentialPda] = getCredentialPDA(ownerKey);

  const tx = await program.methods
    .revoke()
    .accounts({
      credential: credentialPda,
      owner: ownerKey,
      platform: platformKeypair.publicKey,
    } as any)
    .signers([platformKeypair])
    .rpc();

  return {
    success: true,
    tx,
    credentialPda: credentialPda.toString(),
    owner: ownerKey.toString(),
  };
}

// ------- status -------
// read-only, no tx needed
export async function status(subjectPubkey: string) {
  const ownerKey = parsePublicKey(subjectPubkey, "subjectPubkey");
  const [credentialPda] = getCredentialPDA(ownerKey);

  const accountInfo = await connection.getAccountInfo(credentialPda);
  if (!accountInfo) {
    return {
      enrolled: false,
      isActive: false,
      credentialPda: credentialPda.toString(),
    };
  }

  try {
    const account = await (program.account as any).credential.fetch(
      credentialPda
    );
    return {
      enrolled: true,
      isActive: account.isActive,
      owner: account.owner.toString(),
      platform: account.platform.toString(),
      enrolledAt: account.enrolledAt.toString(),
      credentialPda: credentialPda.toString(),
    };
  } catch (err: any) {
    throw new Error(
      `failed to decode credential account ${credentialPda.toString()}: ${err?.message || "unknown error"}`
    );
  }
}

export async function close(subjectPubkey: string) {
  const ownerKey = parsePublicKey(subjectPubkey, "subjectPubkey");
  const [credentialPda] = getCredentialPDA(ownerKey);

  const tx = await program.methods
    .close()
    .accounts({
      credential: credentialPda,
      owner: ownerKey,
      platform: platformKeypair.publicKey,
    } as any)
    .signers([platformKeypair])
    .rpc();

  return {
    success: true,
    tx,
    credentialPda: credentialPda.toString(),
  };
}
