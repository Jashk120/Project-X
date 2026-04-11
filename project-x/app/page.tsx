'use client'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { useConnection } from '@solana/wallet-adapter-react'
import { Program, AnchorProvider, web3 } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import idl from './idl/project_x_program.json'
import { useState } from 'react'
import { registerDriverWithWebAuthn } from './lib/webauthn'

const PROGRAM_ID = new PublicKey('8uGQrehARt9knb4Fs7j15tTVifLwvM56Lre53kYNurTy')

type StatusType = 'idle' | 'loading' | 'success' | 'error'

interface Status {
  type: StatusType
  message: string
  detail?: string
}

export default function Home() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet()
  const { connection } = useConnection()
  const [status, setStatus] = useState<Status>({ type: 'idle', message: '' })
  const API_BASE_URL = process.env.NEXT_PUBLIC_PROJECT_X_API_URL
  
  const getProgram = () => {
    const provider = new AnchorProvider(
      connection,
      { publicKey: publicKey!, signTransaction: signTransaction!, signAllTransactions: signAllTransactions! },
      { commitment: 'confirmed' }
    )
    return new Program(idl as any, provider)
  }

  const parseError = (e: any): { message: string, detail: string } => {
    // Anchor error codes
    if (e?.error?.errorCode?.code) {
      return {
        message: e.error.errorCode.code,
        detail: e.error.errorMessage || ''
      }
    }
    // Transaction simulation error
    if (e?.logs) {
      const relevantLog = e.logs.find((l: string) => l.includes('Error') || l.includes('failed'))
      return {
        message: e.message || 'Transaction failed',
        detail: relevantLog || e.logs.slice(-1)[0] || ''
      }
    }
    // User rejected
    if (e?.message?.includes('User rejected')) {
      return { message: 'Transaction rejected by user', detail: '' }
    }
    return {
      message: e?.message || 'Unknown error',
      detail: e?.toString() || ''
    }
  }

const enroll = async () => {
  if (!publicKey) return
  try {
    setStatus({ type: 'loading', message: 'Starting biometric enrollment...' })
    const result = await registerDriverWithWebAuthn(publicKey.toString())
    setStatus({ 
      type: 'success', 
      message: '✅ Enrolled with biometric!', 
      detail: 'PDA: ' + result.enroll.credentialPda 
    })
  } catch (e: any) {
    setStatus({ type: 'error', message: '❌ ' + e.message })
  }
}

const verify = async () => {
  if (!publicKey) return
  try {
    setStatus({ type: 'loading', message: 'Verifying identity...' })
    const res = await fetch(`${API_BASE_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subjectPubkey: publicKey.toString() }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Verify failed')
    setStatus({ type: 'success', message: '✅ Identity verified!' })
  } catch (e: any) {
    setStatus({ type: 'error', message: '❌ ' + e.message })
  }
}

const revoke = async () => {
  if (!publicKey) return
  try {
    setStatus({ type: 'loading', message: 'Revoking credential...' })
    const res = await fetch(`${API_BASE_URL}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subjectPubkey: publicKey.toString() }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Revoke failed')
    setStatus({ type: 'success', message: '🚫 Credential revoked!' })
  } catch (e: any) {
    setStatus({ type: 'error', message: '❌ ' + e.message })
  }
}
const closePda = async () => {
  if (!publicKey) return
  try {
    setStatus({ type: 'loading', message: 'Closing PDA...' })
    const res = await fetch(`${API_BASE_URL}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subjectPubkey: publicKey.toString() }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Close failed')
    setStatus({ type: 'success', message: '✅ PDA closed! Now enroll again.' })
  } catch (e: any) {
    const { message, detail } = parseError(e)
    setStatus({ type: 'error', message: '❌ Close failed: ' + message, detail })
  }
}
  const statusColors: Record<StatusType, string> = {
    idle: '#888',
    loading: '#f0a500',
    success: '#22c55e',
    error: '#ef4444',
  }

  return (
    <main style={{ padding: 40, fontFamily: 'monospace', maxWidth: 700 }}>
      <h1>Project X — Identity Infrastructure</h1>
      <p>OAuth for the physical world, powered by Solana</p>

        {/* Quick Nav */}
  <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
    <a href="/register" style={{ padding: '8px 16px', background: '#166534', color: 'white', borderRadius: 6, textDecoration: 'none', fontSize: 13 }}>
      Register Identity
    </a>
    <a href="/party?role=partyA" style={{ padding: '8px 16px', background: '#1e3a5f', color: 'white', borderRadius: 6, textDecoration: 'none', fontSize: 13 }}>
      Join as Party A
    </a>
    <a href="/party?role=partyB" style={{ padding: '8px 16px', background: '#3b1f6e', color: 'white', borderRadius: 6, textDecoration: 'none', fontSize: 13 }}>
      Join as Party B
    </a>
  </div>

      <WalletMultiButton />

      {publicKey && (
        <div style={{ marginTop: 20 }}>
          <p style={{ fontSize: 12, color: '#888' }}>Connected: {publicKey.toString()}</p>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={enroll} disabled={status.type === 'loading'}
              style={{ padding: '10px 20px', cursor: 'pointer', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 6 }}>
              Enroll Identity
            </button>
            <button onClick={verify} disabled={status.type === 'loading'}
              style={{ padding: '10px 20px', cursor: 'pointer', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6 }}>
              Verify Identity
            </button>
            <button onClick={revoke} disabled={status.type === 'loading'}
              style={{ padding: '10px 20px', cursor: 'pointer', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6 }}>
              Revoke
            </button>
            <button onClick={closePda} disabled={status.type === 'loading'}
              style={{ padding: '10px 20px', cursor: 'pointer', background: '#854d0e', color: 'white', border: 'none', borderRadius: 6 }}>
              Close PDA
            </button>
          </div>

          {status.message && (
            <div style={{
              marginTop: 16, padding: 16, borderRadius: 8,
              border: `1px solid ${statusColors[status.type]}`,
              background: statusColors[status.type] + '11'
            }}>
              <p style={{ margin: 0, color: statusColors[status.type], fontWeight: 'bold' }}>
                {status.type === 'loading' ? '⏳ ' : ''}{status.message}
              </p>
              {status.detail && (
                <p style={{ margin: '8px 0 0', fontSize: 11, color: '#aaa', wordBreak: 'break-all' }}>
                  {status.detail}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  )
}
