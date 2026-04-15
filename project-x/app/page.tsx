'use client'

import { useEffect, useState } from 'react'
import { API_BASE_URL } from './lib/webauthn'

type StatusType = 'idle' | 'loading' | 'success' | 'error'

type Status = {
  type: StatusType
  message: string
}

const KEYPAIR_KEY = 'project_x_keypair'

function getStoredPubkey() {
  const stored = localStorage.getItem(KEYPAIR_KEY)
  if (!stored) return null

  try {
    const parsed = JSON.parse(stored) as { pubkey?: unknown, publicKey?: unknown }
    const value = parsed.pubkey ?? parsed.publicKey
    return typeof value === 'string' && value ? value : null
  } catch {
    return null
  }
}

export default function Home() {
  const [pubkey, setPubkey] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>({ type: 'idle', message: '' })

  useEffect(() => {
    setPubkey(getStoredPubkey())
  }, [])

  const revoke = async () => {
    if (!pubkey) return

    try {
      setStatus({ type: 'loading', message: 'Revoking credential...' })
      const response = await fetch(`${API_BASE_URL}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectPubkey: pubkey }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Revoke failed')
      }

      setStatus({ type: 'success', message: 'Credential revoked.' })
    } catch (error: unknown) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Revoke failed',
      })
    }
  }

  const closePda = async () => {
    if (!pubkey) return

    try {
      setStatus({ type: 'loading', message: 'Closing credential account...' })
      const response = await fetch(`${API_BASE_URL}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectPubkey: pubkey }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Close failed')
      }

      setStatus({ type: 'success', message: 'Credential account closed.' })
    } catch (error: unknown) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Close failed',
      })
    }
  }

  const statusColors: Record<StatusType, string> = {
    idle: '#888',
    loading: '#f0a500',
    success: '#22c55e',
    error: '#ef4444',
  }

  return (
    <main style={{ padding: 40, fontFamily: 'monospace', maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 8 }}>Project X</h1>
      <p style={{ marginTop: 0, color: '#aaa', lineHeight: 1.5 }}>
        Identity infrastructure demo: the driver creates the session, the rider joins with the same
        session id, and the backend binds both pubkeys before biometric and on-chain verification.
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 16,
        marginTop: 24,
      }}>
        <a href="/demo" style={{
          padding: 18,
          borderRadius: 10,
          background: '#16281b',
          border: '1px solid #2f5b3a',
          color: 'white',
          textDecoration: 'none',
        }}>
          <strong>Register Identity</strong>
          <p style={{ margin: '8px 0 0', color: '#b6d7bf', fontSize: 12 }}>
            Create or reuse the local browser identity and enroll it with WebAuthn.
          </p>
        </a>

        <a href="/driver" style={{
          padding: 18,
          borderRadius: 10,
          background: '#152233',
          border: '1px solid #2d4668',
          color: 'white',
          textDecoration: 'none',
        }}>
          <strong>Driver Flow</strong>
          <p style={{ margin: '8px 0 0', color: '#b8c8df', fontSize: 12 }}>
            Creates or ensures the selected demo session id as party A.
          </p>
        </a>

        <a href="/rider" style={{
          padding: 18,
          borderRadius: 10,
          background: '#261a35',
          border: '1px solid #55327a',
          color: 'white',
          textDecoration: 'none',
        }}>
          <strong>Rider Flow</strong>
          <p style={{ margin: '8px 0 0', color: '#d2c0ea', fontSize: 12 }}>
            Joins the same selected demo session id as party B using the local pubkey.
          </p>
        </a>
      </div>

      <div style={{
        marginTop: 28,
        padding: 18,
        borderRadius: 10,
        background: '#111',
        border: '1px solid #333',
      }}>
        <p style={{ margin: 0, fontSize: 12, color: '#888' }}>Current Local Identity</p>
        <p style={{ margin: '8px 0 0', color: pubkey ? '#22c55e' : '#aaa', wordBreak: 'break-all' }}>
          {pubkey ?? 'No browser-local identity found. Start at Register Identity.'}
        </p>

        {pubkey && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
            <button
              onClick={revoke}
              disabled={status.type === 'loading'}
              style={{
                padding: '10px 18px',
                cursor: 'pointer',
                background: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: 6,
              }}
            >
              Revoke
            </button>
            <button
              onClick={closePda}
              disabled={status.type === 'loading'}
              style={{
                padding: '10px 18px',
                cursor: 'pointer',
                background: '#854d0e',
                color: 'white',
                border: 'none',
                borderRadius: 6,
              }}
            >
              Close PDA
            </button>
          </div>
        )}

        {status.message && (
          <p style={{ margin: '14px 0 0', color: statusColors[status.type] }}>
            {status.message}
          </p>
        )}
      </div>

      <div style={{
        marginTop: 20,
        padding: 18,
        borderRadius: 10,
        background: '#101010',
        border: '1px solid #2a2a2a',
      }}>
        <p style={{ margin: 0, color: '#ddd' }}>Current demo assumptions</p>
        <p style={{ margin: '10px 0 0', color: '#888', fontSize: 13, lineHeight: 1.5 }}>
          The Next app ships with preset demo session ids: <code>active-trip</code>, <code>active-trip-1</code>,
          and <code>active-trip-2</code>. Later the Flutter app can replace that manual selection with BLE
          while keeping the same backend session lifecycle.
        </p>
      </div>
    </main>
  )
}
