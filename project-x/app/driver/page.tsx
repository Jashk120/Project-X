'use client'

import { useState, useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { API_BASE_URL } from '../lib/webauthn'
import {
  ACTIVE_TRIP_ID,
  SESSION_ID_OPTIONS,
  closeSession,
  ensureDriverSession,
  getStoredSessionId,
  storeSessionId,
} from '../lib/active-session'
import { getCurrentCoordinates } from '../lib/location'

type CredentialStatus = 'unknown' | 'active' | 'inactive' | 'not_enrolled'
type SessionStatus = 'idle' | 'connecting' | 'waiting_rider' | 'rider_joined' | 'verifying' | 'verified' | 'failed' | 'disconnected'
type StatusResponse = { enrolled?: boolean, isActive?: boolean, error?: string }

const STATUS_URL = `${API_BASE_URL}/status`
const WEBAUTHN_VERIFY_BEGIN_URL = `${API_BASE_URL}/webauthn/verify/begin`
const WEBAUTHN_VERIFY_COMPLETE_URL = `${API_BASE_URL}/webauthn/verify/complete`
const DRIVER_KEY = 'project_x_keypair'

function getStoredDriverPubkey(): string | null {
  const stored = localStorage.getItem(DRIVER_KEY)
  if (!stored) return null

  const parsed = JSON.parse(stored)
  return parsed.pubkey ?? parsed.publicKey ?? null
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function normalizeVerificationError(error: unknown) {
  const message = getErrorMessage(error, 'Verification failed')
  if (message.toLowerCase().includes('credential not found')) {
    return 'Biometric credential missing for this browser identity. Re-register this driver identity.'
  }

  return message
}

export default function DriverPage() {
  const [pubkey, setPubkey] = useState('')
  const [credentialStatus, setCredentialStatus] = useState<CredentialStatus>('unknown')
  const [credentialError, setCredentialError] = useState('')
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('idle')
  const [verifyResult, setVerifyResult] = useState<{ verified: boolean, reason?: string } | null>(null)
  const [sessionError, setSessionError] = useState('')
  const [sessionReady, setSessionReady] = useState(false)
  const [sessionId, setSessionId] = useState(ACTIVE_TRIP_ID)
  const [closingSession, setClosingSession] = useState(false)
  const [sessionRefreshKey, setSessionRefreshKey] = useState(0)
  const socketRef = useRef<Socket | null>(null)
  const joinedRef = useRef(false)

  const resetSessionState = () => {
    socketRef.current?.disconnect()
    socketRef.current = null
    joinedRef.current = false
    setSessionStatus('idle')
    setVerifyResult(null)
    setSessionReady(false)
  }

  const retrySessionSetup = () => {
    resetSessionState()
    setSessionError('')
    setSessionRefreshKey((value) => value + 1)
  }

  useEffect(() => {
    const storedPubkey = getStoredDriverPubkey()
    setSessionId(getStoredSessionId())
    if (!storedPubkey) {
      window.location.href = '/register?role=driver'
      return
    }
    setPubkey(storedPubkey)
    checkCredential(storedPubkey)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function prepareSession() {
      if (!pubkey) return

      try {
        if (cancelled) return

        await ensureDriverSession(sessionId, pubkey)
        if (!cancelled) {
          setSessionError('')
          setSessionReady(true)
          setSessionStatus('idle')
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setSessionError(getErrorMessage(error, 'Unable to prepare session'))
          setSessionStatus('failed')
          setSessionReady(false)
        }
      }
    }

    prepareSession()

    return () => {
      cancelled = true
    }
  }, [pubkey, sessionId, sessionRefreshKey])

  const checkCredential = async (pk: string) => {
    try {
      const res = await fetch(`${STATUS_URL}?subjectPubkey=${pk}`)
      const raw = await res.text()
      let data: StatusResponse | null = null

      try {
        data = raw ? JSON.parse(raw) as StatusResponse : null
      } catch {
        if (!res.ok) {
          throw new Error(raw || 'Status check failed')
        }
        throw new Error('Status endpoint returned invalid JSON')
      }

      if (!res.ok) {
        throw new Error(data?.error || 'Status check failed')
      }

      setCredentialError('')
      if (!data?.enrolled) setCredentialStatus('not_enrolled')
      else setCredentialStatus(data.isActive ? 'active' : 'inactive')
    } catch (e: unknown) {
      setCredentialStatus('unknown')
      setCredentialError(getErrorMessage(e, 'Unable to check credential status'))
    }
  }

  useEffect(() => {
    if (credentialStatus !== 'active' || !sessionReady || !pubkey || joinedRef.current) return

    joinedRef.current = true
    setSessionStatus('connecting')
    const socket = io(window.location.origin, { path: '/socket.io' })
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('join', { sessionId, pubkey, role: 'partyA' })
      setSessionStatus('waiting_rider')
    })

    socket.on('party:connected', () => {
      setSessionStatus('rider_joined')
    })

    socket.on('verify:result', ({ verified, reason }: { verified: boolean, reason?: string }) => {
      setVerifyResult({ verified, reason })
      setSessionStatus(verified ? 'verified' : 'failed')
    })

    socket.on('session:error', ({ error }: { error: string }) => {
      setVerifyResult({ verified: false, reason: error })
      setSessionStatus('failed')
    })

    socket.on('disconnect', () => {
      socketRef.current = null
      joinedRef.current = false
      setSessionStatus('disconnected')
    })
  }, [credentialStatus, pubkey, sessionId, sessionReady])

  const pressThumb = async () => {
    if (!pubkey || !socketRef.current) return
    try {
      setSessionStatus('verifying')

      // WebAuthn authentication
      const beginRes = await fetch(WEBAUTHN_VERIFY_BEGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, subjectPubkey: pubkey })
      })
      const beginData = await beginRes.json()
      if (!beginRes.ok) throw new Error(beginData.error)

      const { startAuthentication } = await import('@simplewebauthn/browser')
      const authResponse = await startAuthentication({ optionsJSON: beginData })

      // complete verification
      const completeRes = await fetch(WEBAUTHN_VERIFY_COMPLETE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, subjectPubkey: pubkey, response: authResponse })
      })
      const completeData = await completeRes.json()
      if (!completeRes.ok) throw new Error(completeData.error)

      const coords = await getCurrentCoordinates()

      // emit to socket room
      socketRef.current.emit('driver:thumb', {
        sessionId,
        pubkey,
        role: 'partyA',
        coords,
        timestamp: new Date().toISOString(),
      })
    } catch (e: unknown) {
      setVerifyResult({ verified: false, reason: normalizeVerificationError(e) })
      setSessionStatus('failed')
    }
  }

  const handleSessionChange = (nextSessionId: string) => {
    if (nextSessionId === sessionId) return
    resetSessionState()
    setSessionError('')
    storeSessionId(nextSessionId)
    setSessionId(nextSessionId)
  }

  const handleCloseSession = async () => {
    try {
      setClosingSession(true)
      resetSessionState()
      setSessionError('')
      await closeSession(sessionId)
      await ensureDriverSession(sessionId, pubkey)
      setSessionReady(true)
    } catch (error: unknown) {
      setSessionError(getErrorMessage(error, 'Unable to reset session'))
      setSessionStatus('failed')
    } finally {
      setClosingSession(false)
    }
  }

  useEffect(() => () => { socketRef.current?.disconnect() }, [])

  return (
    <main style={{ padding: 24, fontFamily: 'monospace', maxWidth: 500, margin: '0 auto' }}>
      <h1>🚗 Driver Dashboard</h1>

      {/* credential status */}
      <div style={{
        padding: 16, borderRadius: 10, marginBottom: 20,
        background: credentialStatus === 'active' ? '#14532d' :
                    credentialStatus === 'inactive' ? '#7f1d1d' : '#1c1917',
        border: `1px solid ${credentialStatus === 'active' ? '#22c55e' :
                              credentialStatus === 'inactive' ? '#ef4444' : '#444'}`
      }}>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 'bold' }}>
          {credentialStatus === 'active' && '✅ Identity Active'}
          {credentialStatus === 'inactive' && '🚫 Credential Revoked'}
          {credentialStatus === 'not_enrolled' && '⚠️ Not Enrolled'}
          {credentialStatus === 'unknown' && '⏳ Checking...'}
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 10, color: '#aaa', wordBreak: 'break-all' }}>{pubkey}</p>
        {credentialError && (
          <p style={{ margin: '8px 0 0', fontSize: 11, color: '#fca5a5', wordBreak: 'break-word' }}>
            {credentialError}
          </p>
        )}
      </div>

      {credentialStatus === 'not_enrolled' && (
        <button onClick={() => window.location.href = '/register?role=driver'} style={{
          width: '100%', padding: '14px', background: '#7c3aed', color: 'white',
          border: 'none', borderRadius: 8, cursor: 'pointer', marginBottom: 20
        }}>
          Register Identity →
        </button>
      )}

      {credentialStatus === 'active' && (
        <div>
          <div style={{ padding: 12, background: '#111', border: '1px solid #333', borderRadius: 8, marginBottom: 16 }}>
            <p style={{ margin: 0, color: '#888', fontSize: 12 }}>Session</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {SESSION_ID_OPTIONS.map((option) => (
                <button
                  key={option}
                  onClick={() => handleSessionChange(option)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: option === sessionId ? '1px solid #22c55e' : '1px solid #333',
                    background: option === sessionId ? '#14532d' : '#1a1a1a',
                    color: option === sessionId ? '#dcfce7' : '#aaa',
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                    fontSize: 12,
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
            <p style={{ margin: '10px 0 0', color: '#22c55e', fontSize: 12 }}>{sessionId}</p>
            {sessionError && (
              <p style={{ margin: '8px 0 0', color: '#fca5a5', fontSize: 11, wordBreak: 'break-word' }}>
                {sessionError}
              </p>
            )}
            <button
              onClick={handleCloseSession}
              disabled={closingSession || !pubkey}
              style={{
                marginTop: 12,
                padding: '8px 12px',
                background: '#5b2117',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: 12,
              }}
            >
              {closingSession ? 'Resetting session...' : 'Close And Recreate Session'}
            </button>
          </div>

          {sessionStatus === 'idle' && <p style={{ color: '#888' }}>Preparing session...</p>}
          {sessionStatus === 'connecting' && <p style={{ color: '#f0a500' }}>⏳ Connecting...</p>}
          {sessionStatus === 'waiting_rider' && <p style={{ color: '#3b82f6' }}>⏳ Waiting for rider...</p>}
          {sessionStatus === 'disconnected' && <p style={{ color: '#f0a500' }}>Connection lost. Retry to rejoin this session.</p>}

          {sessionStatus === 'rider_joined' && (
            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <p style={{ color: '#22c55e', marginBottom: 24, fontSize: 16 }}>
                👤 Rider wants to verify you
              </p>
              <button onClick={pressThumb} style={{
                width: 140, height: 140, borderRadius: '50%',
                background: '#7c3aed', color: 'white', border: 'none',
                fontSize: 48, cursor: 'pointer', boxShadow: '0 0 30px #7c3aed88'
              }}>
                👆
              </button>
              <p style={{ color: '#888', marginTop: 16, fontSize: 13 }}>Press to verify with biometric</p>
            </div>
          )}

          {sessionStatus === 'verifying' && (
            <div style={{ textAlign: 'center', marginTop: 20, color: '#f0a500' }}>
              ⏳ Verifying biometric...
            </div>
          )}

          {(sessionStatus === 'verified' || sessionStatus === 'failed') && (
            <div style={{
              padding: 24, borderRadius: 10, textAlign: 'center',
              background: sessionStatus === 'verified' ? '#14532d' : '#7f1d1d',
              border: `1px solid ${sessionStatus === 'verified' ? '#22c55e' : '#ef4444'}`
            }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>
                {sessionStatus === 'verified' ? '✅' : '❌'}
              </div>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 'bold' }}>
                {sessionStatus === 'verified' ? 'Verified!' : verifyResult?.reason || 'Failed'}
              </p>
              <button onClick={retrySessionSetup} style={{
                marginTop: 16, padding: '8px 20px', background: 'transparent',
                color: '#888', border: '1px solid #444', borderRadius: 6, cursor: 'pointer'
              }}>
                Retry Session Setup
              </button>
            </div>
          )}

          {(sessionStatus === 'disconnected' || sessionError) && (
            <button onClick={retrySessionSetup} style={{
              width: '100%', marginTop: 12, padding: '10px', background: '#1f3a5f',
              color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer'
            }}>
              Retry Session Setup
            </button>
          )}
        </div>
      )}
    </main>
  )
}
