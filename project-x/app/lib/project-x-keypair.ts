'use client'

import { Keypair, Transaction } from '@solana/web3.js'

export const PROJECT_X_KEYPAIR_KEY = 'project_x_keypair'

type StoredProjectXKeypair = {
  pubkey: string
  secretKey: number[]
}

function base64ToBytes(value: string) {
  const binary = window.atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return window.btoa(binary)
}

export function getStoredProjectXKeypair(): StoredProjectXKeypair | null {
  const stored = localStorage.getItem(PROJECT_X_KEYPAIR_KEY)
  if (!stored) return null

  const parsed = JSON.parse(stored) as Partial<StoredProjectXKeypair>
  if (!parsed.pubkey || !Array.isArray(parsed.secretKey)) {
    throw new Error('Stored Project X identity is invalid')
  }

  return {
    pubkey: parsed.pubkey,
    secretKey: parsed.secretKey,
  }
}

export function loadProjectXKeypair() {
  const stored = getStoredProjectXKeypair()
  if (!stored) {
    throw new Error('Project X identity not found in local storage')
  }

  return Keypair.fromSecretKey(Uint8Array.from(stored.secretKey))
}

export function signSerializedTransaction(serializedTransaction: string) {
  const keypair = loadProjectXKeypair()
  const tx = Transaction.from(base64ToBytes(serializedTransaction))
  tx.partialSign(keypair)
  return bytesToBase64(
    tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }),
  )
}
