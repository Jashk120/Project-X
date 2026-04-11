'use client'

export default function DemoPage() {
  return (
    <main style={{ padding: 40, fontFamily: 'monospace', maxWidth: 420, margin: '0 auto' }}>
      <button
        onClick={() => {
          window.location.href = '/register?role=driver'
        }}
        style={{
          width: '100%',
          padding: '14px',
          marginBottom: 12,
          background: '#2563eb',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
        }}
      >
        Enroll as Driver
      </button>
      <button
        onClick={() => {
          window.location.href = '/register?role=rider'
        }}
        style={{
          width: '100%',
          padding: '14px',
          background: '#7c3aed',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
        }}
      >
        Enroll as Rider
      </button>
    </main>
  )
}
