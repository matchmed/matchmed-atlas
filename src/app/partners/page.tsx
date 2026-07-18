import Link from 'next/link'

const howPartnershipWorks = [
  {
    title: 'Free Physician Access',
    description: 'Partner support helps keep Atlas available to residents, fellows, and practicing ophthalmologists at no cost.',
  },
  {
    title: 'Broader Reach',
    description: 'Partners may help introduce Atlas through resident education, fellowship programs, wet labs, and professional relationships.',
  },
  {
    title: 'Physician Choice',
    description: 'Physicians decide whether they want educational opportunities or direct communication from any partner.',
  },
]

export default function PartnersPage() {
  return (
    <div
      className="partners-page"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '48px 0 80px', color: '#1a1a1a' }}
    >
      <div className="partners-intro">
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: '#1C4A45', marginBottom: 12 }}>Atlas by MatchMed</div>
        <h1 className="font-serif" style={{ fontSize: 28, fontWeight: 700, margin: '0 0 8px', lineHeight: 1.2 }}>Partners Supporting Career Transparency</h1>
        <p style={{ fontSize: 15, color: '#666', margin: '0 0 24px', lineHeight: 1.6 }}>
          Atlas is free for ophthalmologists. Strategic partners help fund the data infrastructure, quality control, technology, and physician education required to keep it that way.
        </p>
        <p style={{ fontSize: 15, color: '#666', margin: '0 0 40px', lineHeight: 1.6 }}>
          Partners may also help introduce Atlas to residents, fellows, and early-career surgeons through educational programs and professional networks. Atlas remains independently operated by MatchMed.
        </p>
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#999', margin: '0 0 16px', paddingBottom: 8, borderBottom: '0.5px solid #e8e8e8' }}>
        How Partnership Works
      </div>

      <div className="partners-how-grid">
        {howPartnershipWorks.map(card => (
          <div
            key={card.title}
            className="bg-canvas"
            style={{ border: '0.5px solid #e0e0e0', borderRadius: 10, padding: '16px 18px', minWidth: 0 }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>{card.title}</div>
            <div style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>{card.description}</div>
          </div>
        ))}
      </div>

      <div className="partners-section-illustrative" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#999', marginBottom: 16, paddingBottom: 8, borderBottom: '0.5px solid #e8e8e8' }}>
        Illustrative Partnership Concept
      </div>

      <div className="bg-canvas" style={{ border: '0.5px solid #e0e0e0', borderRadius: 10, padding: '20px 24px', marginBottom: 48, minWidth: 0 }}>
        <div className="partners-sample-grid">
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>Sample Partner</div>
            <div style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>Founding Career Access Partner</div>
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, margin: '0 0 12px' }}>
              A founding partner supports complimentary Atlas access for residents, fellows, and early-career ophthalmologists and helps expand awareness through existing educational relationships.
            </p>
            <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, margin: 0 }}>
              Physicians may separately choose whether they want wet-lab invitations, product education, or other professional communication from the partner.
            </p>
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#999', lineHeight: 1.6, margin: '16px 0 0' }}>
          This example demonstrates potential partnership placement and messaging only. It does not represent a current commercial relationship.
        </p>
      </div>

      <div style={{ padding: 24, border: '0.5px solid #e8e8e8', borderRadius: 10, background: '#f9f9f9' }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#999', marginBottom: 12 }}>Atlas Independence</div>
        <div className="partners-independence-copy">
          <p style={{ fontSize: 12, color: '#888', lineHeight: 1.7, margin: '0 0 10px' }}>
            Partners cannot purchase rankings, alter scores, influence practice profiles or methodology, or access private physician due-diligence activity. Partner communication is optional, and physicians remain in control of whether they connect.
          </p>
          <p style={{ fontSize: 12, color: '#888', lineHeight: 1.7, margin: 0 }}>
            Use of Atlas is subject to our <Link href="/terms-and-conditions" style={{ color: '#1C4A45' }}>Terms of Service</Link> and <Link href="/privacy-policy" style={{ color: '#1C4A45' }}>Privacy Policy</Link>.
          </p>
        </div>
      </div>
    </div>
  )
}
