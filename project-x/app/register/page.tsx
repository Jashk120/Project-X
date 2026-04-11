'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Keypair } from '@solana/web3.js'
import { API_BASE_URL } from '../lib/webauthn'

const KEYPAIR_KEY = 'project_x_keypair'

function getOrCreateKeypair(): { pubkey: string, secretKey: number[] } {
  const stored = localStorage.getItem(KEYPAIR_KEY)
  if (stored) return JSON.parse(stored)

  const keypair = Keypair.generate()
  const data = {
    pubkey: keypair.publicKey.toBase58(),
    secretKey: Array.from(keypair.secretKey)
  }
  localStorage.setItem(KEYPAIR_KEY, JSON.stringify(data))
  return data
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Registration failed'
}

type Status = 'idle' | 'enrolling' | 'registering_bio' | 'done' | 'error'

export default function RegisterIdentity() {
  const searchParams = useSearchParams()
  const role = searchParams.get('role')
  const [pubkey, setPubkey] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    const kp = getOrCreateKeypair()
    setPubkey(kp.pubkey)
  }, [])

  const enroll = async () => {
    try {
      setStatus('enrolling')
      setError('')

      // Step 1 - platform enrolls pubkey on Solana
      const enrollRes = await fetch(`${API_BASE_URL}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectPubkey: pubkey })
      })
      const enrollData = await enrollRes.json()
      if (!enrollRes.ok) throw new Error(enrollData.error || 'Enroll failed')

      // Step 2 - WebAuthn registration
      setStatus('registering_bio')
      const beginRes = await fetch(`${API_BASE_URL}/webauthn/register/begin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectPubkey: pubkey })
      })
      const beginData = await beginRes.json()
      if (!beginRes.ok) throw new Error(beginData.error || 'WebAuthn begin failed')

      // Step 3 - device biometric prompt
      const { startRegistration } = await import('@simplewebauthn/browser')
      const regResponse = await startRegistration({ optionsJSON: beginData })

      // Step 4 - complete registration
      const completeRes = await fetch(`${API_BASE_URL}/webauthn/register/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectPubkey: pubkey, response: regResponse })
      })
      const completeData = await completeRes.json()
      if (!completeRes.ok) throw new Error(completeData.error || 'WebAuthn complete failed')

      if (role === 'driver' || role === 'rider') {
        const stored = localStorage.getItem(KEYPAIR_KEY)
        if (!stored) throw new Error('Registered identity missing from local storage')

        const parsed = JSON.parse(stored) as { pubkey?: string }
        if (!parsed.pubkey) throw new Error('Stored identity is missing pubkey')

        const usersRes = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, pubkey: parsed.pubkey }),
        })
        const usersData = await usersRes.json()
        if (!usersRes.ok) throw new Error(usersData.error || 'Failed to save registered user')
      }

      setStatus('done')
    } catch (e: unknown) {
      setError(getErrorMessage(e))
      setStatus('error')
    }
  }

  return (
    <main style={{ padding: 40, fontFamily: 'monospace', maxWidth: 500, margin: '0 auto' }}>
      <h1>Register Identity</h1>
      <p style={{ color: '#888' }}>Register your Project X identity</p>

      {pubkey && (
        <div style={{ marginTop: 20 }}>
          <div style={{ padding: 16, background: '#111', borderRadius: 8, marginBottom: 20 }}>
            <p style={{ margin: 0, fontSize: 11, color: '#888' }}>Your Identity</p>
            <p style={{ margin: '4px 0 0', fontSize: 11, wordBreak: 'break-all', color: '#22c55e' }}>
              {pubkey}
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 11, color: '#555' }}>
              Generated on your device. Your private key never leaves this device.
            </p>
          </div>

          {status === 'idle' && (
            <button onClick={enroll} style={{
              width: '100%', padding: '16px', fontSize: 18,
              background: '#7c3aed', color: 'white',
              border: 'none', borderRadius: 8, cursor: 'pointer'
            }}>
              Register with Biometric
            </button>
          )}

          {status === 'enrolling' && (
            <div style={{ textAlign: 'center', color: '#f0a500' }}>
              Enrolling identity on Solana...
            </div>
          )}

          {status === 'registering_bio' && (
            <div style={{ textAlign: 'center', color: '#f0a500' }}>
              Complete the biometric prompt...
            </div>
          )}

          {status === 'done' && (
            <div style={{ padding: 20, background: '#14532d', borderRadius: 8, border: '1px solid #22c55e' }}>
              <p style={{ margin: 0, color: '#22c55e', fontSize: 18, fontWeight: 'bold' }}>
                Registered Successfully
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#aaa' }}>
                Your identity is now on Solana. You can verify yourself on any integrated platform.
              </p>
              <button onClick={() => window.location.href = role === 'rider' ? '/rider' : '/driver'} style={{
                marginTop: 16, width: '100%', padding: '12px',
                background: '#22c55e', color: 'white',
                border: 'none', borderRadius: 8, cursor: 'pointer'
              }}>
                Continue
              </button>
            </div>
          )}

          {status === 'error' && (
            <div style={{ padding: 16, background: '#7f1d1d', borderRadius: 8, border: '1px solid #ef4444' }}>
              <p style={{ margin: 0, color: '#ef4444' }}>{error}</p>
              <button onClick={() => setStatus('idle')} style={{
                marginTop: 12, padding: '8px 16px', background: 'transparent',
                color: '#888', border: '1px solid #444', borderRadius: 6, cursor: 'pointer'
              }}>
                Try Again
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
