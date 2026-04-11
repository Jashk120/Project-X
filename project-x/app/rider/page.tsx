'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { io, Socket } from 'socket.io-client'
import { ACTIVE_TRIP_ID, ensureActiveTripSession, fetchUsers } from '../lib/active-session'
import { API_BASE_URL } from '../lib/webauthn'

type VerifyStatus = 'idle' | 'connecting' | 'waiting' | 'verifying' | 'verified' | 'failed' | 'revoked'

const WEBAUTHN_VERIFY_BEGIN_URL = `${API_BASE_URL}/webauthn/verify/begin`
const WEBAUTHN_VERIFY_COMPLETE_URL = `${API_BASE_URL}/webauthn/verify/complete`

function getStoredRiderPubkey(): string | null {
  const stored = localStorage.getItem('project_x_keypair')
  if (!stored) return null

  const parsed = JSON.parse(stored) as { publicKey?: string, pubkey?: string }
  return parsed.publicKey ?? parsed.pubkey ?? null
}

function RiderContent() {
  const [driverPubkey, setDriverPubkey] = useState('')
  const [riderPubkey, setRiderPubkey] = useState('')
  const [status, setStatus] = useState<VerifyStatus>('idle')
  const [errorDetail, setErrorDetail] = useState('')
  const [sessionError, setSessionError] = useState('')
  const socketRef = useRef<Socket | null>(null)
  const joinedRef = useRef(false)
  const verifyInFlightRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function prepareSession() {
      try {
        const users = await fetchUsers()
        if (cancelled) return

        setDriverPubkey(users.driver ?? '')
        setRiderPubkey(getStoredRiderPubkey() ?? '')
        setSessionError('')
        await ensureActiveTripSession(users)
      } catch (error: unknown) {
        if (!cancelled) {
          setSessionError(error instanceof Error ? error.message : 'Unable to prepare active trip')
          setStatus('failed')
        }
      }
    }

    prepareSession()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect()
    }
  }, [])

  const verifyIdentity = async () => {
    if (!socketRef.current || !riderPubkey || verifyInFlightRef.current) return

    try {
      verifyInFlightRef.current = true
      setStatus('verifying')
      setErrorDetail('')

      const beginRes = await fetch(WEBAUTHN_VERIFY_BEGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: ACTIVE_TRIP_ID, subjectPubkey: riderPubkey }),
      })
      const beginData = await beginRes.json()
      if (!beginRes.ok) throw new Error(beginData.error || 'Verification begin failed')

      const { startAuthentication } = await import('@simplewebauthn/browser')
      const authResponse = await startAuthentication({ optionsJSON: beginData })

      const completeRes = await fetch(WEBAUTHN_VERIFY_COMPLETE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: ACTIVE_TRIP_ID,
          subjectPubkey: riderPubkey,
          response: authResponse,
        }),
      })
      const completeData = await completeRes.json()
      if (!completeRes.ok) throw new Error(completeData.error || 'Verification complete failed')

      socketRef.current.emit('driver:thumb', {
        sessionId: ACTIVE_TRIP_ID,
        pubkey: riderPubkey,
        role: 'partyB',
      })
    } catch (error: unknown) {
      setStatus('failed')
      setErrorDetail(error instanceof Error ? error.message : 'Verification failed')
    } finally {
      verifyInFlightRef.current = false
    }
  }

  const joinSession = () => {
    if (!driverPubkey || !riderPubkey || joinedRef.current) return

    joinedRef.current = true
    setStatus('connecting')

    const socket = io(window.location.origin, { path: '/socket.io' })
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('join', { sessionId: ACTIVE_TRIP_ID, pubkey: riderPubkey, role: 'partyB' })
      setStatus('waiting')
    })

    socket.on('party:connected', () => {
      console.log('both parties connected to room')
    })

    socket.on('driver:verifying', ({ role }: { role?: string }) => {
      if (role !== 'partyA') return
      void verifyIdentity()
    })

    socket.on('verify:result', ({ verified, reason }: { verified: boolean, reason?: string }) => {
      if (verified) {
        setStatus('verified')
      } else {
        if (reason?.includes('revoked')) setStatus('revoked')
        else setStatus('failed')
        setErrorDetail(reason || 'Verification failed')
      }
    })

    socket.on('disconnect', () => {
      console.log('socket disconnected')
    })

    socket.on('session:error', ({ error }: { error: string }) => {
      setStatus('failed')
      setErrorDetail(error)
    })
  }

  useEffect(() => {
    if (driverPubkey && riderPubkey) {
      joinSession()
    }
  }, [driverPubkey, riderPubkey])

  const reset = () => {
    socketRef.current?.disconnect()
    socketRef.current = null
    joinedRef.current = false
    setStatus('idle')
    setErrorDetail('')
  }

  const statusConfig = {
    idle:       { bg: '#1c1917', border: '#444',    emoji: '🔍', text: 'Enter session details to begin' },
    connecting: { bg: '#1c1917', border: '#f0a500', emoji: '⏳', text: 'Connecting...' },
    waiting:    { bg: '#1c1917', border: '#3b82f6', emoji: '👍', text: 'Waiting for driver to press thumb...' },
    verifying:  { bg: '#1c1917', border: '#f0a500', emoji: '⏳', text: 'Verifying your identity...' },
    verified:   { bg: '#14532d', border: '#22c55e', emoji: '✅', text: 'Driver Verified — Safe to ride!' },
    failed:     { bg: '#7f1d1d', border: '#ef4444', emoji: '❌', text: 'Verification Failed' },
    revoked:    { bg: '#7f1d1d', border: '#ef4444', emoji: '🚫', text: 'Driver Credential Revoked — Do not ride!' },
  }

  const s = statusConfig[status]

  return (
    <main style={{ padding: 40, fontFamily: 'monospace', maxWidth: 600 }}>
      <h1>🧍 Rider Verification</h1>
      <p style={{ color: '#888' }}>Project X — Verify your driver before you ride</p>

      <div style={{
        padding: 16, borderRadius: 10, marginTop: 20,
        background: '#111', border: '1px solid #333'
      }}>
        <p style={{ margin: 0, fontSize: 11, color: '#888' }}>Your Rider Identity</p>
        <p style={{ margin: '6px 0 0', fontSize: 11, color: '#22c55e', wordBreak: 'break-all' }}>
          {riderPubkey || 'Loading...'}
        </p>
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={{ marginBottom: 20, padding: 16, background: '#111', border: '1px solid #333', borderRadius: 8 }}>
          <p style={{ margin: 0, fontSize: 11, color: '#888' }}>Driver Identity</p>
          <p style={{ margin: '6px 0 0', fontSize: 11, color: '#aaa', wordBreak: 'break-all' }}>
            {driverPubkey || 'Missing'}
          </p>
          <p style={{ margin: '12px 0 0', fontSize: 11, color: '#888' }}>Active Trip</p>
          <p style={{ margin: '6px 0 0', fontSize: 11, color: '#22c55e' }}>{ACTIVE_TRIP_ID}</p>
          {sessionError && (
            <p style={{ margin: '8px 0 0', color: '#fca5a5', fontSize: 11, wordBreak: 'break-word' }}>
              {sessionError}
            </p>
          )}
        </div>

        {/* status box */}
        <div style={{
          padding: 24, borderRadius: 10, marginBottom: 20,
          background: s.bg, border: `1px solid ${s.border}`, textAlign: 'center'
        }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>{s.emoji}</div>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 'bold', color: s.border }}>{s.text}</p>
          {errorDetail && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#aaa' }}>{errorDetail}</p>}
        </div>

        {(status === 'verified' || status === 'failed' || status === 'revoked') && (
          <button onClick={reset} style={{
            width: '100%', marginTop: 10, padding: '10px', background: 'transparent',
            color: '#888', border: '1px solid #333', borderRadius: 8, cursor: 'pointer'
          }}>
            New Session
          </button>
        )}
      </div>
    </main>
  )
}

export default function RiderPage() {
  return (
    <Suspense>
      <RiderContent />
    </Suspense>
  )
}
