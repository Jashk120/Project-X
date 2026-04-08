'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { io, Socket } from 'socket.io-client'

type VerifyStatus = 'idle' | 'connecting' | 'waiting' | 'verified' | 'failed' | 'revoked'

const SERVER = 'http://10.53.148.125:4575'

function RiderContent() {
  const searchParams = useSearchParams()
  const [driverPubkey, setDriverPubkey] = useState('Hh7CMtUBuTtWhmByqgsy8UGz1kmNckRKB8mp9Yrbvirf')
  const [riderPubkey, setRiderPubkey] = useState('Hh7CMtUBuTtWhmByqgsy8UGz1kmNckRKB8mp9Yrbvirf')
  const [identifier, setIdentifier] = useState('123')
  const [status, setStatus] = useState<VerifyStatus>('idle')
  const [errorDetail, setErrorDetail] = useState('')
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    const driver = searchParams.get('driver')
    const rider = searchParams.get('rider')
    const id = searchParams.get('id')
    if (driver) setDriverPubkey(driver)
    if (rider) setRiderPubkey(rider)
    if (id) setIdentifier(id)
  }, [searchParams])

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect()
    }
  }, [])

  const joinSession = () => {
    if (!driverPubkey || !riderPubkey || !identifier) return

    setStatus('connecting')

    const socket = io(SERVER)
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('rider:join', { driverPubkey, riderPubkey, identifier })
      setStatus('waiting')
    })

    socket.on('driver:connected', () => {
      console.log('driver connected to room')
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
  }

  const reset = () => {
    socketRef.current?.disconnect()
    socketRef.current = null
    setStatus('idle')
    setErrorDetail('')
  }

  const statusConfig = {
    idle:       { bg: '#1c1917', border: '#444',    emoji: '🔍', text: 'Enter session details to begin' },
    connecting: { bg: '#1c1917', border: '#f0a500', emoji: '⏳', text: 'Connecting...' },
    waiting:    { bg: '#1c1917', border: '#3b82f6', emoji: '👍', text: 'Waiting for driver to press thumb...' },
    verified:   { bg: '#14532d', border: '#22c55e', emoji: '✅', text: 'Driver Verified — Safe to ride!' },
    failed:     { bg: '#7f1d1d', border: '#ef4444', emoji: '❌', text: 'Verification Failed' },
    revoked:    { bg: '#7f1d1d', border: '#ef4444', emoji: '🚫', text: 'Driver Credential Revoked — Do not ride!' },
  }

  const s = statusConfig[status]

  return (
    <main style={{ padding: 40, fontFamily: 'monospace', maxWidth: 600 }}>
      <h1>🧍 Rider Verification</h1>
      <p style={{ color: '#888' }}>Project X — Verify your driver before you ride</p>

      <div style={{ marginTop: 24 }}>
        {/* inputs — hidden once session started */}
        {status === 'idle' && (
          <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', color: '#888', marginBottom: 6, fontSize: 13 }}>Driver Pubkey</label>
              <input value={driverPubkey} onChange={e => setDriverPubkey(e.target.value)}
                placeholder="Driver wallet address..."
                style={{ width: '100%', padding: '10px 14px', background: '#111', border: '1px solid #333', borderRadius: 6, color: 'white', fontFamily: 'monospace', fontSize: 12, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', color: '#888', marginBottom: 6, fontSize: 13 }}>Rider Pubkey</label>
              <input value={riderPubkey} onChange={e => setRiderPubkey(e.target.value)}
                placeholder="Your wallet address..."
                style={{ width: '100%', padding: '10px 14px', background: '#111', border: '1px solid #333', borderRadius: 6, color: 'white', fontFamily: 'monospace', fontSize: 12, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', color: '#888', marginBottom: 6, fontSize: 13 }}>Session Identifier</label>
              <input value={identifier} onChange={e => setIdentifier(e.target.value)}
                placeholder="Trip ID, booking ID, etc..."
                style={{ width: '100%', padding: '10px 14px', background: '#111', border: '1px solid #333', borderRadius: 6, color: 'white', fontFamily: 'monospace', fontSize: 12, boxSizing: 'border-box' }} />
            </div>
          </div>
        )}

        {/* status box */}
        <div style={{
          padding: 24, borderRadius: 10, marginBottom: 20,
          background: s.bg, border: `1px solid ${s.border}`, textAlign: 'center'
        }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>{s.emoji}</div>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 'bold', color: s.border }}>{s.text}</p>
          {errorDetail && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#aaa' }}>{errorDetail}</p>}
        </div>

        {status === 'idle' && (
          <button onClick={joinSession}
            disabled={!driverPubkey || !riderPubkey || !identifier}
            style={{ width: '100%', padding: '14px', fontSize: 16, fontWeight: 'bold', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Join Session
          </button>
        )}

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