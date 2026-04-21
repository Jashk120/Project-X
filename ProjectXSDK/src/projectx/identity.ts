import * as Keychain from 'react-native-keychain';
import { ed25519 } from '@noble/curves/ed25519';
import { Buffer } from 'buffer';
import { Keypair, Transaction } from '@solana/web3.js';

import { base64ToBytes, bytesToBase64 } from './base64';
import { ProjectXError } from './errors';
import type { ProjectXIdentity, StoredIdentity } from './types';

const SERVICE = 'project-x.identity';
const USERNAME = 'project-x';

function toStoredIdentity(keypair: Keypair): StoredIdentity {
  return {
    pubkey: keypair.publicKey.toBase58(),
    secretKeyBase64: bytesToBase64(keypair.secretKey),
  };
}

function parseStoredIdentity(password: string): StoredIdentity {
  const parsed = JSON.parse(password) as Partial<StoredIdentity>;

  if (!parsed.pubkey || !parsed.secretKeyBase64) {
    throw new ProjectXError(
      'identity_invalid',
      'Stored Project X identity is invalid',
    );
  }

  return {
    pubkey: parsed.pubkey,
    secretKeyBase64: parsed.secretKeyBase64,
  };
}

export class ProjectXIdentityManager {
  async getStoredIdentity(): Promise<ProjectXIdentity | null> {
    const credentials = await Keychain.getGenericPassword({ service: SERVICE });
    if (!credentials) {
      return null;
    }

    return parseStoredIdentity(credentials.password);
  }

  async getOrCreateIdentity(): Promise<ProjectXIdentity> {
    const existing = await this.getStoredIdentity();
    if (existing) {
      return existing;
    }

    const keypair = Keypair.generate();
    const stored = toStoredIdentity(keypair);

    const persisted = await Keychain.setGenericPassword(USERNAME, JSON.stringify(stored), {
      service: SERVICE,
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK,
    });

    if (!persisted) {
      throw new ProjectXError(
        'identity_store_failed',
        'Unable to persist the local Project X identity',
      );
    }

    const confirmed = await this.getStoredIdentity();
    if (!confirmed || confirmed.pubkey !== stored.pubkey) {
      throw new ProjectXError(
        'identity_store_failed',
        'Stored Project X identity could not be read back after saving',
      );
    }

    return confirmed;
  }

  async resetIdentity() {
    await Keychain.resetGenericPassword({ service: SERVICE });
  }

  async loadKeypair() {
    const identity = await this.getOrCreateIdentity();
    return Keypair.fromSecretKey(base64ToBytes(identity.secretKeyBase64));
  }

  async signSerializedTransaction(serializedTransaction: string) {
    const keypair = await this.loadKeypair();
    const tx = Transaction.from(base64ToBytes(serializedTransaction));
    tx.partialSign(keypair);
    return bytesToBase64(
      tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      }),
    );
  }

  async signMessage(message: string) {
    const keypair = await this.loadKeypair();
    const signature = ed25519.sign(
      Buffer.from(message, 'utf8'),
      keypair.secretKey.slice(0, 32),
    );
    return bytesToBase64(signature);
  }
}
