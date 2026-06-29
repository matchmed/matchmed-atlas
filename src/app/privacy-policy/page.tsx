export default function PrivacyPolicyPage() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', maxWidth: 720, margin: '0 auto', padding: '48px 0 80px', color: '#1a1a1a' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: '#1C4A45', marginBottom: 12 }}>MatchMed, LLC</div>
      <h1 className="font-serif" style={{ fontSize: 28, fontWeight: 700, margin: '0 0 8px', lineHeight: 1.2 }}>Privacy Policy</h1>
      <p style={{ fontSize: 15, color: '#666', margin: '0 0 40px', lineHeight: 1.6 }}>Effective Date: March 30, 2026</p>

      <div style={{ background: '#E8F0EF', borderLeft: '3px solid #1C4A45', padding: '16px 20px', borderRadius: '0 8px 8px 0', marginBottom: 40 }}>
        <strong style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: '#1C4A45', marginBottom: 4 }}>Questions?</strong>
        <p style={{ margin: 0, fontSize: 14, color: '#444' }}>Contact <a href="mailto:admin@matchmed.app" style={{ color: '#1C4A45' }}>admin@matchmed.app</a></p>
      </div>

      {[
        { num: '01', title: 'Introduction', content: 'MatchMed, LLC operates matchmed.app and the MatchMed platform. This Privacy Policy explains how we collect, safeguard, and disclose personal information. By using the Service, you agree to the collection and use of information in accordance with this Policy.' },
        { num: '02', title: 'Types of Data Collected', content: 'We may collect: account and registration information (name, email, phone); professional credentials including NPI, specialty, training status, and preferred locations; profile information such as CV and areas of expertise; preferences including desired positions and career interests; communications when you submit requests; payment information; and cookies and tracking data.' },
        { num: '03', title: 'Purposes of Collection', content: 'We use collected information to provide and maintain the Service; verify professional identity using NPI and public registry data; generate and display analytics about ophthalmology practices using CMS data; facilitate connections between physicians and practices, staffing firms, and industry partners; provide notifications about relevant opportunities; and provide customer support and improve the Service.' },
        { num: '04', title: 'Usage and Tracking Technologies', content: 'We use cookies, beacons, tags, and other tracking technologies to collect data about your use of the Services. Most browsers allow you to remove or stop accepting cookies. We do not currently respond to Do Not Track signals.' },
        { num: '05', title: 'Communications', content: 'We may send promotional emails; you can unsubscribe at any time. If you opted in at registration, we may send SMS/MMS messages; opt out anytime by texting STOP. Transactional and compliance-related emails are sent regardless of marketing preferences.' },
        { num: '06', title: 'Retention of Data', content: 'We retain personal information while your account is active or as needed to provide the Service. Upon a verified deletion request, we will action it within 45 days except where retention is required for legal compliance. Transaction data may be retained for accounting or tax purposes.' },
        { num: '07', title: 'Disclosure of Data', content: 'We may disclose personal information where required by law; in the context of a business transaction; to service providers under confidentiality obligations; to fulfill your instructions to share your profile with industry partners (if opted in); or with your consent. Industry partners who receive your information are subject to contractual restrictions on its use. You may withdraw this consent at any time by contacting admin@matchmed.app.' },
        { num: '08', title: 'Security of Data', content: 'We strive to use commercially acceptable means to protect your personal information. No method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.' },
        { num: '09', title: 'Your Privacy Rights', content: 'Regardless of your state of residence, you have the right to know, access, correct, and delete your personal information; opt out of tracking and sales of your personal information; and withdraw consent at any time. To exercise these rights, contact admin@matchmed.app. We will respond within 45 days.' },
        { num: '11', title: 'California Consumer Privacy Act (CCPA)', content: 'California residents have additional rights under the CCPA, including the right to know, access, delete, and opt out of the sale of personal information. We do not sell personal information without explicit consent. Contact admin@matchmed.app to exercise your CCPA rights.' },
        { num: '13', title: 'Eligibility', content: 'Our Services are not intended for individuals under the age of 18. We do not knowingly collect personally identifiable information from minors. Our Services are intended for physicians and healthcare professionals operating in the United States.' },
        { num: '14', title: 'Changes to This Privacy Policy', content: 'We may update this Privacy Policy from time to time. We will notify you of material changes by posting the new Policy and updating the effective date. Changes are effective when posted.' },
        { num: '15', title: 'Contact Us', content: 'If you have any questions about this Privacy Policy, please contact us at admin@matchmed.app.' },
      ].map(s => (
        <section key={s.num} id={`p${s.num}`}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#999', margin: '40px 0 16px', paddingBottom: 8, borderBottom: '0.5px solid #e8e8e8', display: 'flex', alignItems: 'center' }}>
            <span style={{ color: '#1C4A45', marginRight: 8, fontWeight: 700 }}>{s.num}</span>
            {s.title}
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: '#444', margin: '0 0 16px' }}>{s.content}</p>
        </section>
      ))}
    </div>
  )
}
