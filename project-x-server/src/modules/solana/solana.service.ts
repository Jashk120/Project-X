import { createHash, randomUUID } from "node:crypto";
import { BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  connection,
  program,
  platformKeypair,
  PROGRAM_ID,
} from "../../config/solana";
import { getSession } from "../session/session.service";
import { requireApprovedProximityAttestation } from "../proximity/proximity.service";

const PREPARE_TTL_MS = 90_000;

type PreparedBase = {
  prepareId: string;
  kind: "enroll" | "verify";
  serializedTransaction: string;
  serializedMessage: string;
  messageHash: string;
  blockhash: string;
  lastValidBlockHeight: number;
  expiresAt: number;
};

type PreparedEnrollRecord = PreparedBase & {
  kind: "enroll";
  subjectPubkey: string;
  credentialPda: string;
  credentialHashHex: string;
};

type PreparedVerifyRecord = PreparedBase & {
  kind: "verify";
  sessionId: string;
  partyAPubkey: string;
  partyBPubkey: string;
  credentialPda: string;
  proximityAttestationPda: string;
  proximityAttestationId: string;
  signatures: Partial<Record<"partyA" | "partyB", string>>;
};

const preparedTransactions = new Map<
  string,
  PreparedEnrollRecord | PreparedVerifyRecord
>();

export function getCredentialPDA(ownerPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("credential"), ownerPubkey.toBuffer()],
    PROGRAM_ID,
  );
}

export function getProximityAttestationPDA(
  partyAPubkey: PublicKey,
  partyBPubkey: PublicKey,
  attestationNonce: BN,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("proximity"),
      partyAPubkey.toBuffer(),
      partyBPubkey.toBuffer(),
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

function pruneExpiredPreparedTransactions() {
  const now = Date.now();
  for (const [prepareId, record] of preparedTransactions.entries()) {
    if (record.expiresAt <= now) {
      preparedTransactions.delete(prepareId);
    }
  }
}

function createPrepareId() {
  return randomUUID();
}

function getMessageHashFromTransaction(tx: Transaction) {
  return createHash("sha256").update(tx.serializeMessage()).digest("hex");
}

function getSerializedMessage(tx: Transaction) {
  return Buffer.from(tx.serializeMessage()).toString("base64");
}

function deserializeTransaction(serializedTransaction: string) {
  try {
    return Transaction.from(Buffer.from(serializedTransaction, "base64"));
  } catch {
    throw new Error("invalid serialized transaction");
  }
}

function serializeTransaction(tx: Transaction) {
  return tx
    .serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    })
    .toString("base64");
}

function getRecordOrThrow<T extends PreparedBase["kind"]>(
  prepareId: string,
  kind: T,
): Extract<PreparedEnrollRecord | PreparedVerifyRecord, { kind: T }> {
  pruneExpiredPreparedTransactions();
  const record = preparedTransactions.get(prepareId);
  if (!record || record.kind !== kind) {
    throw new Error("prepared transaction not found or expired");
  }

  if (record.expiresAt <= Date.now()) {
    preparedTransactions.delete(prepareId);
    throw new Error("prepared transaction expired");
  }

  return record as Extract<PreparedEnrollRecord | PreparedVerifyRecord, { kind: T }>;
}

function getRequiredSignature(
  tx: Transaction,
  signer: PublicKey,
): Buffer {
  const entry = tx.signatures.find((candidate) =>
    candidate.publicKey.equals(signer),
  );

  if (!entry?.signature) {
    throw new Error(`missing signature for ${signer.toBase58()}`);
  }

  return Buffer.from(entry.signature);
}

function assertSignedTransactionMatchesPrepared(
  serializedTransaction: string,
  record: PreparedBase,
) {
  const tx = deserializeTransaction(serializedTransaction);
  const serializedMessage = getSerializedMessage(tx);
  if (serializedMessage !== record.serializedMessage) {
    throw new Error("signed transaction message bytes do not match prepared transaction");
  }

  const messageHash = getMessageHashFromTransaction(tx);
  if (messageHash !== record.messageHash) {
    throw new Error("signed transaction message does not match prepared transaction");
  }

  if (tx.recentBlockhash !== record.blockhash) {
    throw new Error("signed transaction blockhash does not match prepared transaction");
  }

  if (!tx.verifySignatures(false)) {
    throw new Error("signed transaction contains an invalid signature");
  }

  return tx;
}

async function finalizeAndSubmitPreparedTransaction(
  tx: Transaction,
  record: PreparedBase,
) {
  const txid = await connection.sendRawTransaction(
    tx.serialize({
      requireAllSignatures: true,
      verifySignatures: true,
    }),
  );

  const confirmation = await connection.confirmTransaction(
    {
      signature: txid,
      blockhash: record.blockhash,
      lastValidBlockHeight: record.lastValidBlockHeight,
    },
    "confirmed",
  );

  if (confirmation.value.err) {
    throw new Error(`transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  }

  return txid;
}

async function buildEnrollTransaction(
  ownerKey: PublicKey,
  credentialHash: Buffer,
) {
  const [credentialPda] = getCredentialPDA(ownerKey);
  const tx = await program.methods
    .enroll(Array.from(credentialHash))
    .accounts({
      credential: credentialPda,
      owner: ownerKey,
      platform: platformKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    } as any)
    .transaction();

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.feePayer = platformKeypair.publicKey;
  tx.recentBlockhash = blockhash;

  return { tx, credentialPda, blockhash, lastValidBlockHeight };
}

async function ensurePreparedProximityAttestation(
  sessionId: string,
  partyAKey: PublicKey,
  partyBKey: PublicKey,
) {
  const attestation = await requireApprovedProximityAttestation(
    sessionId,
    partyAKey.toBase58(),
    partyBKey.toBase58(),
  );
  const sessionIdHash = hashSessionId(sessionId);
  const attestationNonce = getAttestationNonce(attestation.attestationId);
  const expiresAtSeconds = Math.floor(
    new Date(attestation.expiresAt).getTime() / 1000,
  );
  const [proximityAttestationPda] = getProximityAttestationPDA(
    partyAKey,
    partyBKey,
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
        partyA: partyAKey,
        partyB: partyBKey,
        platform: platformKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([platformKeypair])
      .rpc();
  }

  return {
    attestation,
    sessionIdHash,
    attestationNonce,
    proximityAttestationPda,
  };
}

async function buildVerifyTransaction(
  partyAKey: PublicKey,
  partyBKey: PublicKey,
  sessionId: string,
) {
  const [credentialPda] = getCredentialPDA(partyAKey);
  const {
    attestation,
    sessionIdHash,
    attestationNonce,
    proximityAttestationPda,
  } = await ensurePreparedProximityAttestation(sessionId, partyAKey, partyBKey);

  const tx = await program.methods
    .verify(Array.from(sessionIdHash), attestationNonce)
    .accounts({
      proximityAttestation: proximityAttestationPda,
      credential: credentialPda,
      partyA: partyAKey,
      partyB: partyBKey,
      verifier: platformKeypair.publicKey,
    } as any)
    .transaction();

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.feePayer = platformKeypair.publicKey;
  tx.recentBlockhash = blockhash;

  return {
    tx,
    attestation,
    credentialPda,
    proximityAttestationPda,
    blockhash,
    lastValidBlockHeight,
  };
}

export async function prepareEnroll(
  subjectPubkey: string,
  credentialHashHex: string,
) {
  const ownerKey = parsePublicKey(subjectPubkey, "subjectPubkey");
  const credentialHash = Buffer.from(credentialHashHex, "hex");

  if (credentialHash.length !== 32) {
    throw new Error("credentialHash must decode to 32 bytes");
  }

  const { tx, credentialPda, blockhash, lastValidBlockHeight } =
    await buildEnrollTransaction(ownerKey, credentialHash);
  const prepareId = createPrepareId();
  const expiresAt = Date.now() + PREPARE_TTL_MS;
  const serializedTransaction = serializeTransaction(tx);

  preparedTransactions.set(prepareId, {
    prepareId,
    kind: "enroll",
    serializedTransaction,
    serializedMessage: getSerializedMessage(tx),
    messageHash: getMessageHashFromTransaction(tx),
    blockhash,
    lastValidBlockHeight,
    expiresAt,
    subjectPubkey: ownerKey.toBase58(),
    credentialPda: credentialPda.toBase58(),
    credentialHashHex,
  });

  return {
    prepareId,
    transaction: serializedTransaction,
    expiresAt: new Date(expiresAt).toISOString(),
    credentialPda: credentialPda.toBase58(),
    owner: ownerKey.toBase58(),
    platform: platformKeypair.publicKey.toBase58(),
  };
}

export async function submitEnroll(
  prepareId: string,
  signedTransaction: string,
) {
  const record = getRecordOrThrow(prepareId, "enroll");
  const ownerKey = parsePublicKey(record.subjectPubkey, "subjectPubkey");
  const signedTx = assertSignedTransactionMatchesPrepared(
    signedTransaction,
    record,
  );
  const ownerSignature = getRequiredSignature(signedTx, ownerKey);

  const finalTx = deserializeTransaction(record.serializedTransaction);
  finalTx.addSignature(ownerKey, ownerSignature);
  finalTx.partialSign(platformKeypair);

  if (!finalTx.verifySignatures(true)) {
    throw new Error("final enroll transaction failed signature verification");
  }

  const txid = await finalizeAndSubmitPreparedTransaction(finalTx, record);
  preparedTransactions.delete(prepareId);

  return {
    success: true,
    tx: txid,
    credentialPda: record.credentialPda,
    owner: record.subjectPubkey,
    platform: platformKeypair.publicKey.toBase58(),
  };
}

export async function prepareVerify(
  subjectPubkey: string,
  riderPubkey: string,
  sessionId: string,
) {
  const partyAKey = parsePublicKey(subjectPubkey, "subjectPubkey");
  const partyBKey = parsePublicKey(riderPubkey, "riderPubkey");
  const session = await getSession(sessionId);

  if (session.driverPubkey !== subjectPubkey) {
    throw new Error("subjectPubkey does not match session driver");
  }

  if (session.riderPubkey !== riderPubkey) {
    throw new Error("riderPubkey does not match session rider");
  }

  const {
    tx,
    attestation,
    credentialPda,
    proximityAttestationPda,
    blockhash,
    lastValidBlockHeight,
  } = await buildVerifyTransaction(partyAKey, partyBKey, sessionId);

  const prepareId = createPrepareId();
  const expiresAt = Date.now() + PREPARE_TTL_MS;
  const serializedTransaction = serializeTransaction(tx);

  preparedTransactions.set(prepareId, {
    prepareId,
    kind: "verify",
    serializedTransaction,
    serializedMessage: getSerializedMessage(tx),
    messageHash: getMessageHashFromTransaction(tx),
    blockhash,
    lastValidBlockHeight,
    expiresAt,
    sessionId,
    partyAPubkey: partyAKey.toBase58(),
    partyBPubkey: partyBKey.toBase58(),
    credentialPda: credentialPda.toBase58(),
    proximityAttestationPda: proximityAttestationPda.toBase58(),
    proximityAttestationId: attestation.attestationId,
    signatures: {},
  });

  return {
    prepareId,
    transaction: serializedTransaction,
    expiresAt: new Date(expiresAt).toISOString(),
    partyAPubkey: partyAKey.toBase58(),
    partyBPubkey: partyBKey.toBase58(),
    credentialPda: credentialPda.toBase58(),
    proximityAttestationPda: proximityAttestationPda.toBase58(),
    proximityAttestationId: attestation.attestationId,
  };
}

export async function submitVerifySignature(
  prepareId: string,
  signerPubkey: string,
  signedTransaction: string,
) {
  const record = getRecordOrThrow(prepareId, "verify");
  const signedTx = assertSignedTransactionMatchesPrepared(
    signedTransaction,
    record,
  );

  let role: "partyA" | "partyB";
  let signerKey: PublicKey;
  if (signerPubkey === record.partyAPubkey) {
    role = "partyA";
    signerKey = parsePublicKey(record.partyAPubkey, "partyAPubkey");
  } else if (signerPubkey === record.partyBPubkey) {
    role = "partyB";
    signerKey = parsePublicKey(record.partyBPubkey, "partyBPubkey");
  } else {
    throw new Error("signer pubkey does not match prepared verification parties");
  }

  const signature = getRequiredSignature(signedTx, signerKey);
  record.signatures[role] = signature.toString("base64");
  preparedTransactions.set(prepareId, record);

  if (!record.signatures.partyA || !record.signatures.partyB) {
    return {
      status: "pending" as const,
      prepareId,
      collected: {
        partyA: Boolean(record.signatures.partyA),
        partyB: Boolean(record.signatures.partyB),
      },
      expiresAt: new Date(record.expiresAt).toISOString(),
    };
  }

  const finalTx = deserializeTransaction(record.serializedTransaction);
  finalTx.addSignature(
    parsePublicKey(record.partyAPubkey, "partyAPubkey"),
    Buffer.from(record.signatures.partyA, "base64"),
  );
  finalTx.addSignature(
    parsePublicKey(record.partyBPubkey, "partyBPubkey"),
    Buffer.from(record.signatures.partyB, "base64"),
  );
  finalTx.partialSign(platformKeypair);

  if (!finalTx.verifySignatures(true)) {
    throw new Error("final verify transaction failed signature verification");
  }

  const txid = await finalizeAndSubmitPreparedTransaction(finalTx, record);
  preparedTransactions.delete(prepareId);

  return {
    status: "submitted" as const,
    success: true,
    tx: txid,
    credentialPda: record.credentialPda,
    proximityAttestationId: record.proximityAttestationId,
    proximityAttestationPda: record.proximityAttestationPda,
  };
}

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
    const account = await (program.account as any).credential.fetch(credentialPda);
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
      `failed to decode credential account ${credentialPda.toString()}: ${err?.message || "unknown error"}`,
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
