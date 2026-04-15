'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { io, Socket } from 'socket.io-client'
import { getCurrentCoordinates } from '../lib/location'


type PartyRole = 'partyA' | 'partyB'
type Status = 'idle' | 'joining' | 'joined' | 'ready' | 'verifying' | 'verified' | 'failed'
const API_BASE_URL = process.env.NEXT_PUBLIC_PROJECT_X_API_URL

const SERVER = API_BASE_URL?.replace(/\/api\/v1$/, '')
const WEBAUTHN_VERIFY_BEGIN_URL = `${API_BASE_URL}/webauthn/verify/begin`
const WEBAUTHN_VERIFY_COMPLETE_URL = `${API_BASE_URL}/webauthn/verify/complete`

function parseRole(value: string | null): PartyRole {
  return value === 'partyB' ? 'partyB' : 'partyA'
}

function readKeypair(role: PartyRole): { pubkey: string, secretKey: number[] } | null {
  const stored = localStorage.getItem('project_x_keypair')
  if (!stored) return null

  const parsed = JSON.parse(stored)
  const pubkey = parsed.pubkey ?? parsed.publicKey
  if (pubkey && parsed.secretKey) return { pubkey, secretKey: parsed.secretKey }

  return null
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function PartyContent() {
  const searchParams = useSearchParams()
  const role = parseRole(searchParams.get('role'))
  const [sessionId, setSessionId] = useState(() => searchParams.get('sessionId') ?? '')
  const [pubkey, setPubkey] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    const keypair = readKeypair(role)
    if (!keypair) {
      setMessage(`No local keypair found for ${role}. Register this device first.`)
      return
    }

    setPubkey(keypair.pubkey)
  }, [role])

  useEffect(() => () => { socketRef.current?.disconnect() }, [])

  const joinSession = () => {
    if (!sessionId || !pubkey) return

    setStatus('joining')
    setMessage('')

    const socket = io(window.location.origin, { path: '/socket.io' })
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('join', { sessionId, pubkey, role })
      setStatus('joined')
    })

    socket.on('party:connected', () => {
      setMessage('Both parties are connected.')
    })

    socket.on('driver:verifying', () => {
      setStatus('ready')
      setMessage('Verification requested. Complete biometric verification.')
    })

    socket.on('verify:result', ({ verified, reason }: { verified: boolean, reason?: string }) => {
      setStatus(verified ? 'verified' : 'failed')
      setMessage(verified ? 'Verification complete.' : reason || 'Verification failed')
    })

    socket.on('session:error', ({ error }: { error: string }) => {
      setStatus('failed')
      setMessage(error)
    })
  }

  const completeBiometric = async () => {
    if (!sessionId || !pubkey) return

    try {
      setStatus('verifying')
      setMessage('')

      const beginRes = await fetch(WEBAUTHN_VERIFY_BEGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectPubkey: pubkey }),
      })
      const beginData = await beginRes.json()
      if (!beginRes.ok) throw new Error(beginData.error || 'Verification begin failed')

      const { startAuthentication } = await import('@simplewebauthn/browser')
      const authResponse = await startAuthentication({ optionsJSON: beginData })

      const completeRes = await fetch(WEBAUTHN_VERIFY_COMPLETE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, subjectPubkey: pubkey, response: authResponse }),
      })
      const completeData = await completeRes.json()
      if (!completeRes.ok) throw new Error(completeData.error || 'Verification complete failed')

      const coords = await getCurrentCoordinates()
      socketRef.current?.emit('driver:thumb', {
        sessionId,
        pubkey,
        role,
        coords,
        timestamp: new Date().toISOString(),
      })

      setStatus('joined')
      setMessage(completeData.verified
        ? 'Biometric verified. Waiting for the other party.'
        : completeData.reason || 'Verification failed')
    } catch (error: unknown) {
      setStatus('failed')
      setMessage(getErrorMessage(error, 'Verification failed'))
    }
  }

  return (
    <main style={{ padding: 32, fontFamily: 'monospace', maxWidth: 560, margin: '0 auto' }}>
      <h1>Project X Verification</h1>

      <div style={{ padding: 16, background: '#111', border: '1px solid #333', borderRadius: 8, marginBottom: 16 }}>
        <p style={{ margin: 0, color: '#888', fontSize: 12 }}>Role</p>
        <p style={{ margin: '4px 0 0', color: '#22c55e' }}>{role}</p>
        <p style={{ margin: '12px 0 0', color: '#888', fontSize: 12 }}>Identity</p>
        <p style={{ margin: '4px 0 0', color: '#aaa', fontSize: 11, wordBreak: 'break-all' }}>
          {pubkey || 'No local identity found'}
        </p>
      </div>

      {status === 'idle' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ color: '#888', fontSize: 13 }}>Session ID</label>
            <input value={sessionId} onChange={e => setSessionId(e.target.value)}
              placeholder="Trip code"
              style={{ width: '100%', padding: 10, marginTop: 6, background: '#111', border: '1px solid #333', borderRadius: 6, color: 'white', fontFamily: 'monospace', boxSizing: 'border-box' }} />
          </div>
          <button onClick={joinSession} disabled={!sessionId || !pubkey}
            style={{ padding: 14, background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Join Session
          </button>
        </div>
      )}

      {status === 'joined' && (
        <button onClick={completeBiometric}
          style={{ width: '100%', padding: 14, background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          Verify and Share Location
        </button>
      )}

      {status === 'ready' && (
        <button onClick={completeBiometric}
          style={{ width: '100%', padding: 14, background: '#22c55e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          Verify with Biometric
        </button>
      )}

      {status === 'joining' && <p style={{ color: '#f0a500' }}>Joining session...</p>}
      {status === 'verifying' && <p style={{ color: '#f0a500' }}>Completing biometric verification...</p>}
      {status === 'verified' && <p style={{ color: '#22c55e' }}>Verified</p>}
      {status === 'failed' && <p style={{ color: '#ef4444' }}>Verification failed</p>}
      {message && <p style={{ color: '#aaa', fontSize: 12, wordBreak: 'break-word' }}>{message}</p>}
    </main>
  )
}

export default function PartyPage() {
  return (
    <Suspense>
      <PartyContent />
    </Suspense>
  )
}
