import Link from 'next/link'

export default function TermsPage() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', maxWidth: 720, margin: '0 auto', padding: '48px 0 80px', color: '#1a1a1a' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: '#185FA5', marginBottom: 12 }}>MatchMed, LLC</div>
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 8px', lineHeight: 1.2 }}>Terms of Service</h1>
      <p style={{ fontSize: 15, color: '#666', margin: '0 0 40px', lineHeight: 1.6 }}>Effective Date: March 30, 2026</p>

      <div style={{ background: '#f0f5fb', borderLeft: '3px solid #185FA5', padding: '16px 20px', borderRadius: '0 8px 8px 0', marginBottom: 40 }}>
        <strong style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: '#185FA5', marginBottom: 4 }}>Questions?</strong>
        <p style={{ margin: 0, fontSize: 14, color: '#444' }}>Contact <a href="mailto:admin@matchmed.app" style={{ color: '#185FA5' }}>admin@matchmed.app</a></p>
      </div>

      {[
        { num: '01', title: 'Introduction', content: 'These Terms of Service govern your access and use of matchmed.app and our MatchMed platform (the "Service") operated by MatchMed, LLC. By using the Service, you agree to be bound by these Terms, including our Privacy Policy. PLEASE READ CAREFULLY. BY ACCESSING THE SERVICE, YOU AGREE THAT YOU HAVE READ AND UNDERSTOOD THESE TERMS.' },
        { num: '02', title: 'Eligibility', content: 'Our services are available to licensed physicians, medical professionals, physicians in post-graduate training, and entities lawfully authorized to employ physicians. Users must be at least 18 years of age and legally capable of entering into binding agreements.' },
        { num: '03', title: 'CCPA Compliance', content: 'California residents have rights under the CCPA, including the right to know, access, delete, and opt-out of the sale of personal information. See our Privacy Policy for details on exercising these rights.' },
        { num: '04', title: 'Facilitating Engagements', content: 'MatchMed operates Atlas, an ophthalmology workforce intelligence platform. The Service acts as a platform to facilitate connections between medical professionals and potential employers or industry partners. The Service does not provide physician or medical services and is not engaged in regulated employment or placement activities. Nothing under these Terms creates an employment relationship between the Service and any user.' },
        { num: '4A', title: 'Atlas Scores and Practice Intelligence', content: 'Scores are derived exclusively from publicly available datasets, including Medicare Part B Provider Data published by CMS. Scores are historical and observational, not real-time. They are for informational purposes only and should not be used as the sole basis for employment or contracting decisions. Scores do not measure clinical quality, patient outcomes, compensation, or workplace culture. Specific component weights are proprietary trade secrets of MatchMed, LLC.' },
        { num: '05', title: 'Data Processing and Storage', content: 'By using our Service, you consent to the processing of your personal information in the United States. We may engage third-party service providers to process your personal data subject to confidentiality obligations.' },
        { num: '06', title: 'Subscriptions', content: 'Some parts of Service are billed on a subscription basis. Subscriptions auto-renew unless cancelled before the next billing cycle. Valid payment information is required. Should automatic billing fail, we will issue an electronic invoice.' },
        { num: '07', title: 'Communications and Consent', content: 'By creating an account, we may send newsletters and service-related communications. Text message consent is collected separately at registration and is not a condition of account creation. You may opt out of text messages at any time by texting STOP. Industry partner communications require separate opt-in and may be withdrawn by contacting admin@matchmed.app.' },
        { num: '14', title: 'Prohibited Uses', content: 'You may not use the Service in violation of any law, engage in hateful or harassing conduct, transmit spam, impersonate MatchMed or other users, or use automated means to access the Service. You may not introduce viruses or attempt to gain unauthorized access to any part of the Service.' },
        { num: '15', title: 'Accounts', content: 'You must be 18 or older to create an account. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. Notify us immediately of any unauthorized use.' },
        { num: '16', title: 'Intellectual Property', content: 'The Service and its content remain the exclusive property of MatchMed and its licensors. You receive a limited, non-exclusive, non-transferable, revocable license to access and use the Service solely for personal, non-commercial use.' },
        { num: '22', title: 'Disclaimer of Warranty', content: 'THESE SERVICES ARE PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS. MATCHMED MAKES NO WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, NON-INFRINGEMENT, AND FITNESS FOR PARTICULAR PURPOSE.' },
        { num: '23', title: 'Limitation of Liability', content: 'EXCEPT AS PROHIBITED BY LAW, MATCHMED WILL NOT BE LIABLE FOR ANY INDIRECT, PUNITIVE, SPECIAL, INCIDENTAL, OR CONSEQUENTIAL DAMAGE. IF LIABILITY IS FOUND, IT WILL BE LIMITED TO THE AMOUNT PAID FOR SERVICES IN THE 12 MONTHS PRECEDING THE CLAIM.' },
        { num: '24', title: 'No Class Actions', content: 'YOU AND MATCHMED AGREE THAT EACH MAY BRING CLAIMS ONLY IN AN INDIVIDUAL CAPACITY AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY CLASS ACTION. BOTH PARTIES WAIVE THE RIGHT TO A TRIAL BY JURY.' },
        { num: '24A', title: 'Dispute Resolution and Binding Arbitration', content: 'Except for small claims court disputes, all disputes shall be resolved through final and binding arbitration under AAA Commercial Arbitration Rules. Before initiating arbitration, parties must attempt informal resolution for 30 days. Arbitration conducted in Wilmington, Delaware or via videoconference.' },
        { num: '24B', title: 'Indemnification', content: 'You agree to defend, indemnify, and hold harmless MatchMed and its officers, directors, employees, and agents from claims arising from your use of the Service, violation of these Terms, or any misrepresentation you make.' },
        { num: '25', title: 'Termination', content: 'We may terminate or suspend your account immediately, without notice, for breach of these Terms. Sections 4A, 16, 22, 23, 24, 24A, 24B, and 26 survive termination.' },
        { num: '26', title: 'Governing Law', content: 'These Terms are governed by the laws of the State of Delaware, consistent with MatchMed, LLC\'s state of incorporation.' },
        { num: '32', title: 'Contact Us', content: 'Send feedback, comments, or support requests to admin@matchmed.app.' },
      ].map(s => (
        <section key={s.num} id={`s${s.num}`}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#999', margin: '40px 0 16px', paddingBottom: 8, borderBottom: '0.5px solid #e8e8e8', display: 'flex', alignItems: 'center' }}>
            <span style={{ color: '#185FA5', marginRight: 8, fontWeight: 700 }}>{s.num}</span>
            {s.title}
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: '#444', margin: '0 0 16px' }}>{s.content}</p>
        </section>
      ))}
    </div>
  )
}
