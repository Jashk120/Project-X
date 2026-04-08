'use client'

import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { useState, useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

type CredentialStatus = 'unknown' | 'active' | 'inactive' | 'not_enrolled'
type SessionStatus = 'idle' | 'connecting' | 'waiting_rider' | 'rider_joined' | 'verified' | 'failed'

const SERVER = 'http://10.53.148.125:4575'

export default function DriverPage() {
  const { publicKey } = useWallet()
  const [credentialStatus, setCredentialStatus] = useState<CredentialStatus>('unknown')
  const [loading, setLoading] = useState(false)
  const [enrollStatus, setEnrollStatus] = useState('')

  // session
  const [riderPubkey, setRiderPubkey] = useState('Hh7CMtUBuTtWhmByqgsy8UGz1kmNckRKB8mp9Yrbvirf')
  const [identifier, setIdentifier] = useState('123')
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('idle')
  const [verifyResult, setVerifyResult] = useState<{ verified: boolean, reason?: string } | null>(null)
  const socketRef = useRef<Socket | null>(null)

  const checkCredential = async () => {
    if (!publicKey) return
    try {
      const res = await fetch(`${SERVER}/api/v1/status?subjectPubkey=${publicKey.toString()}`)
      const data = await res.json()
      if (!data.enrolled) setCredentialStatus('not_enrolled')
      else setCredentialStatus(data.isActive ? 'active' : 'inactive')
    } catch {
      setCredentialStatus('unknown')
    }
  }

  const enroll = async () => {
    if (!publicKey) return
    try {
      setLoading(true)
      setEnrollStatus('Enrolling...')
      const res = await fetch(`${SERVER}/api/v1/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectPubkey: publicKey.toString() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Enroll failed')
      setEnrollStatus('✅ Enrolled!')
      setCredentialStatus('active')
    } catch (e: any) {
      setEnrollStatus('❌ ' + (e?.message || 'Error'))
    } finally {
      setLoading(false)
    }
  }

  const joinSession = () => {
    if (!publicKey || !riderPubkey || !identifier) return

    setSessionStatus('connecting')
    const socket = io(SERVER)
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('driver:join', {
        driverPubkey: publicKey.toString(),
        riderPubkey,
        identifier,
      })
      setSessionStatus('waiting_rider')
    })

    socket.on('rider:waiting', () => {
      setSessionStatus('rider_joined')
    })

    socket.on('verify:result', ({ verified, reason }: { verified: boolean, reason?: string }) => {
      setVerifyResult({ verified, reason })
      setSessionStatus(verified ? 'verified' : 'failed')
    })
  }

  const pressThumb = () => {
    if (!publicKey || !socketRef.current) return
    socketRef.current.emit('driver:thumb', {
      driverPubkey: publicKey.toString(),
      riderPubkey,
      identifier,
    })
  }

  const resetSession = () => {
    socketRef.current?.disconnect()
    socketRef.current = null
    setSessionStatus('idle')
    setVerifyResult(null)
    setRiderPubkey('')
    setIdentifier('')
  }

  useEffect(() => {
    if (publicKey) checkCredential()
  }, [publicKey])

  useEffect(() => {
    return () => { socketRef.current?.disconnect() }
  }, [])

  return (
    <main style={{ padding: 40, fontFamily: 'monospace', maxWidth: 600 }}>
      <h1>🚗 Driver Dashboard</h1>
      <p style={{ color: '#888' }}>Project X — Identity Infrastructure</p>

      <WalletMultiButton />

      {publicKey && (
        <div style={{ marginTop: 24 }}>

          {/* credential status */}
          <div style={{
            padding: 20, borderRadius: 10, marginBottom: 20,
            background: credentialStatus === 'active' ? '#14532d' :
                        credentialStatus === 'inactive' ? '#7f1d1d' : '#1c1917',
            border: `1px solid ${credentialStatus === 'active' ? '#22c55e' :
                                  credentialStatus === 'inactive' ? '#ef4444' : '#444'}`
          }}>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 'bold' }}>
              {credentialStatus === 'active' && '✅ Identity Verified — Active'}
              {credentialStatus === 'inactive' && '🚫 Credential Revoked'}
              {credentialStatus === 'not_enrolled' && '⚠️ Not Enrolled'}
              {credentialStatus === 'unknown' && '⏳ Checking...'}
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 11, color: '#aaa' }}>
              {publicKey.toString()}
            </p>
          </div>

          {credentialStatus === 'not_enrolled' && (
            <div style={{ marginBottom: 20 }}>
              <button onClick={enroll} disabled={loading} style={{
                padding: '12px 24px', background: '#7c3aed', color: 'white',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14
              }}>
                {loading ? 'Enrolling...' : 'Enroll Identity'}
              </button>
              {enrollStatus && <p style={{ marginTop: 8, color: '#aaa' }}>{enrollStatus}</p>}
            </div>
          )}

          {/* session panel — only when active */}
          {credentialStatus === 'active' && (
            <div style={{ marginTop: 20 }}>
              {sessionStatus === 'idle' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', color: '#888', marginBottom: 6, fontSize: 13 }}>Rider Pubkey</label>
                    <input value={riderPubkey} onChange={e => setRiderPubkey(e.target.value)}
                      placeholder="Rider wallet address..."
                      style={{ width: '100%', padding: '10px 14px', background: '#111', border: '1px solid #333', borderRadius: 6, color: 'white', fontFamily: 'monospace', fontSize: 12, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', color: '#888', marginBottom: 6, fontSize: 13 }}>Session Identifier</label>
                    <input value={identifier} onChange={e => setIdentifier(e.target.value)}
                      placeholder="Trip ID, booking ID, etc..."
                      style={{ width: '100%', padding: '10px 14px', background: '#111', border: '1px solid #333', borderRadius: 6, color: 'white', fontFamily: 'monospace', fontSize: 12, boxSizing: 'border-box' }} />
                  </div>
                  <button onClick={joinSession}
                    disabled={!riderPubkey || !identifier}
                    style={{ padding: '12px 24px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>
                    Start Session
                  </button>
                </div>
              )}

              {sessionStatus === 'connecting' && (
                <p style={{ color: '#f0a500' }}>⏳ Connecting to server...</p>
              )}

              {sessionStatus === 'waiting_rider' && (
                <p style={{ color: '#3b82f6' }}>⏳ Waiting for rider to join...</p>
              )}

              {sessionStatus === 'rider_joined' && (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: '#22c55e', marginBottom: 20 }}>✅ Rider joined — press thumb to verify</p>
                  <button onClick={pressThumb} style={{
                    width: 120, height: 120, borderRadius: '50%',
                    background: '#7c3aed', color: 'white', border: 'none',
                    fontSize: 40, cursor: 'pointer'
                  }}>
                    👍
                  </button>
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
                  <button onClick={resetSession} style={{
                    marginTop: 16, padding: '8px 20px', background: 'transparent',
                    color: '#888', border: '1px solid #444', borderRadius: 6, cursor: 'pointer'
                  }}>
                    New Session
                  </button>
                </div>
              )}
            </div>
          )}

          <button onClick={checkCredential} style={{
            marginTop: 20, padding: '8px 16px', background: 'transparent',
            color: '#888', border: '1px solid #444', borderRadius: 6, cursor: 'pointer'
          }}>
            Refresh Status
          </button>
        </div>
      )}
    </main>
  )
}