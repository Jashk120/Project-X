import { PublicKey } from "@solana/web3.js";
import { connection, program, platformKeypair, PROGRAM_ID } from "../../config/solana";

export function getCredentialPDA(ownerPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("credential"), ownerPubkey.toBuffer()],
    PROGRAM_ID
  );
}

export function parsePublicKey(key: string, label = "publicKey"): PublicKey {
  try {
    return new PublicKey(key);
  } catch {
    throw new Error(`invalid ${label}`);
  }
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
export async function verify(subjectPubkey: string, _riderPubkey?: string) {
  const ownerKey = parsePublicKey(subjectPubkey, "subjectPubkey");
  const [credentialPda] = getCredentialPDA(ownerKey);

  const tx = await program.methods
    .verify(true) // proximity_verified = true, caller asserts this
    .accounts({
      credential: credentialPda,
      owner: ownerKey,
      verifier: platformKeypair.publicKey,
    }as any)
    .signers([platformKeypair])
    .rpc();

  return {
    success: true,
    tx,
    credentialPda: credentialPda.toString(),
    owner: ownerKey.toString(),
    verifiedBy: platformKeypair.publicKey.toString(),
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
