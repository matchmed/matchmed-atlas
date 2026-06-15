import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 20, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 380, background: 'white', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06)', border: '1px solid #eee', padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16, color: '#185FA5', fontWeight: 700 }}>404</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 8 }}>Page not found</h1>
        <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, marginBottom: 24 }}>
          The page you are looking for does not exist or may have been moved.
        </p>
        <Link
          href="/"
          style={{ display: 'inline-block', padding: '11px 20px', background: '#185FA5', color: 'white', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  )
}
