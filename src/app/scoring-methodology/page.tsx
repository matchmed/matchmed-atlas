import Link from 'next/link'

export default function ScoringMethodologyPage() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', maxWidth: 720, margin: '0 auto', padding: '48px 0 80px', color: '#1a1a1a' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: '#185FA5', marginBottom: 12 }}>Atlas by MatchMed</div>
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 8px', lineHeight: 1.2 }}>About the scores</h1>
      <p style={{ fontSize: 15, color: '#666', margin: '0 0 40px', lineHeight: 1.6 }}>Every number on Atlas is derived from publicly available government data. No surveys, no self-reporting, no recruiter claims. Here's exactly how we calculate what you see.</p>

      <SectionLabel>Data source</SectionLabel>
      <div style={{ background: '#f5f5f5', borderRadius: 8, padding: '16px 18px', marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: '#444', lineHeight: 1.6, margin: 0 }}>
          <strong>Medicare Part B Provider Data, <a href="https://data.cms.gov/" target="_blank" rel="noopener" style={{ color: '#185FA5' }}>Centers for Medicare &amp; Medicaid Services (CMS)</a>.</strong> This dataset captures physician-practice affiliations across annual snapshots. Atlas scores are calculated from 2019 onwards, using the complete longitudinal record of every physician who has appeared on a practice's Medicare roster. No proprietary, self-reported, or third-party data is used. Practices cannot edit, remove, or influence what appears in this data.
          <br /><br />
          <span style={{ fontSize: 12, color: '#888' }}>Atlas is not affiliated with, endorsed by, or sponsored by the Centers for Medicare &amp; Medicaid Services or any other federal agency.</span>
        </p>
      </div>

      <SectionLabel>The core idea</SectionLabel>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: '#444', marginBottom: 16 }}>Every physician who joins a practice either stays or leaves. Staying is an endorsement. The longer they stay, the stronger it is. Leaving is a withdrawal of that endorsement, and the weight of that withdrawal depends on how long they stayed before deciding to go.</p>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: '#444', marginBottom: 24 }}>A physician who leaves in under two years saw something immediately disqualifying. A physician who leaves after five years likely hit a structural ceiling: partnership that never materialized, growth that stalled. Both matter. The Retention Score captures both, weighted by how invested each physician was when they left.</p>

      <SectionLabel>The scores</SectionLabel>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: '#444', marginBottom: 16 }}>Each score is scaled 0–100. Higher reflects stronger physician retention.</p>

      <ScoreCard title="Attrition Resistance" weight="Primary component">
        <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 12 }}>Measures the weighted departure load of physicians who have left the practice. Unlike a simple short-exit count, every departure is weighted by how long the physician stayed, with shorter departures carrying significantly more penalty.</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
          <thead>
            <tr>
              {['Tenure at departure', 'Penalty', 'Signal'].map(h => (
                <th key={h} style={{ textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#999', padding: '6px 12px', borderBottom: '0.5px solid #e8e8e8' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['0 – 2 years', 'Highest', 'Immediate red flag. Something disqualifying found quickly'],
              ['2 – 4 years', 'High', 'Classic churn. Dysfunction discovered within partnership track'],
              ['4 – 6 years', 'Moderate', 'Partnership or growth failure. A structural ceiling hit'],
              ['6 – 10 years', 'Low', 'Baseline signal. Ambiguous, many possible explanations'],
              ['10+ years', 'Minimal', 'Near-retirement territory. Lower signal weight'],
            ].map(([tenure, penalty, signal]) => (
              <tr key={tenure}>
                <td style={{ padding: '8px 12px', borderBottom: '0.5px solid #f2f2f2', color: '#444', fontSize: 13 }}>{tenure}</td>
                <td style={{ padding: '8px 12px', borderBottom: '0.5px solid #f2f2f2' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: penalty === 'Highest' ? '#fde8e8' : penalty === 'High' ? '#fff0e0' : penalty === 'Moderate' ? '#fff0e0' : penalty === 'Low' ? '#e8f4ee' : '#f0f0f0', color: penalty === 'Highest' || penalty === 'High' ? '#A32D2D' : penalty === 'Moderate' ? '#7B3F00' : penalty === 'Low' ? '#1A6B3A' : '#666' }}>{penalty}</span>
                </td>
                <td style={{ padding: '8px 12px', borderBottom: '0.5px solid #f2f2f2', color: '#444', fontSize: 13 }}>{signal}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 12, color: '#185FA5', background: '#f0f5fb', borderLeft: '3px solid #185FA5', padding: '8px 12px', borderRadius: '0 6px 6px 0', lineHeight: 1.5 }}>
          Any individual departure may have a personal explanation. But across 6,400 practices and eight years of data, idiosyncratic reasons average out. A practice with a systematic pattern of departures at a specific career stage is showing something structural, regardless of what any single physician says when they leave.
        </div>
      </ScoreCard>

      <ScoreCard title="Tenure Strength" weight="Secondary component">
        <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 12 }}>Measures how long physicians currently at the practice have stayed. Calculated from the active roster only. Physicians who have already left no longer contribute to this metric.</p>
        <div style={{ fontSize: 12, color: '#185FA5', background: '#f0f5fb', borderLeft: '3px solid #185FA5', padding: '8px 12px', borderRadius: '0 6px 6px 0', lineHeight: 1.5 }}>
          Departed physicians should not continue to prop up a practice's score after they leave. Tenure Strength reflects the current workforce: the physicians who will actually be your colleagues if you join.
        </div>
      </ScoreCard>

      <ScoreCard title="Cluster Signals" weight="Score modifier" weightColor="#7B3F00" weightBg="#fff3e6">
        <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 12 }}>Two pattern-level signals that apply a downward modifier when triggered.</p>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>Temporal cluster</div>
          <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, margin: '0 0 14px' }}>Fires when a meaningful concentration of departures occurs within a defined rolling window. Signals a systemic event such as leadership change, acquisition, or cultural disruption. Applies a <strong>downward score adjustment</strong>.</p>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>Tenure similarity cluster</div>
          <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, margin: 0 }}>Fires when multiple physicians departed after a similar amount of time. Signals a structural failure at a specific career stage. Applies a <strong>downward score adjustment</strong>.</p>
        </div>
      </ScoreCard>

      <ScoreCard title="Experience Level" weight="Context only" weightColor="#888" weightBg="#f5f5f5">
        <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 12 }}>Measures the collective seniority of the current roster. Derived from median years since medical school graduation. Displayed as context alongside the Retention Score but not included in the composite.</p>
        <div style={{ fontSize: 12, color: '#185FA5', background: '#f0f5fb', borderLeft: '3px solid #185FA5', padding: '8px 12px', borderRadius: '0 6px 6px 0', lineHeight: 1.5 }}>
          Experience level reflects practice maturity. Senior-heavy rosters can carry succession and PE acquisition risk that would be incorrectly rewarded if included in a retention composite.
        </div>
      </ScoreCard>

      <ScoreCard title="Retention Score" weight="Composite">
        <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 12 }}>A weighted composite of Attrition Resistance and Tenure Strength, adjusted by cluster signals.</p>
        <div style={{ background: '#f5f5f5', borderRadius: 8, padding: '16px 20px', fontFamily: 'monospace', fontSize: 13, color: '#1a1a1a', marginBottom: 12, lineHeight: 1.8 }}>
          Retention Score =<br />
          &nbsp;&nbsp;[(<span style={{ color: '#185FA5', fontWeight: 600 }}>Attrition Resistance</span> × primary weight)<br />
          &nbsp;&nbsp;+ (<span style={{ color: '#185FA5', fontWeight: 600 }}>Tenure Strength</span> × secondary weight)]<br />
          &nbsp;&nbsp;× <span style={{ color: '#185FA5', fontWeight: 600 }}>Cluster Modifier</span> (if applicable)
        </div>
        <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, margin: 0 }}>Specific component weights are proprietary.</p>
      </ScoreCard>

      <SectionLabel>Delta scores: change since 2019</SectionLabel>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: '#444', marginBottom: 16 }}>Every metric is compared against a 2019 baseline. Delta scores show whether a practice has improved, deteriorated, or remained stable over time.</p>
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {[['#1A6B3A', '▲ +', 'More stable than 2019'], ['#888', '—', 'No meaningful change'], ['#A32D2D', '▼ −', 'Less stable than 2019']].map(([color, symbol, label]) => (
          <div key={label} style={{ flex: 1, background: '#f9f9f9', borderRadius: 8, padding: '14px 16px', textAlign: 'center', border: '0.5px solid #e8e8e8' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color, marginBottom: 4 }}>{symbol}</div>
            <div style={{ fontSize: 11, color: '#888' }}>{label}</div>
          </div>
        ))}
      </div>

      <SectionLabel>What the score is not</SectionLabel>
      <div style={{ background: '#fff8f0', border: '0.5px solid #f0d0a0', borderRadius: 10, padding: '18px 22px', marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, margin: 0 }}>
          The Retention Score is <strong>not</strong> a measure of clinical quality, patient outcomes, compensation, or workplace culture. It answers one question: <em>based on how physicians have historically moved through this practice, how well does it retain the people who join it?</em>
          <br /><br />
          Use Atlas as one input in your due diligence, alongside site visits, peer conversations, and contract review with an attorney.
        </p>
      </div>

      <SectionLabel>Data errors and corrections</SectionLabel>
      <div style={{ background: '#f9f9f9', border: '0.5px solid #e0e0e0', borderRadius: 10, padding: '20px 24px', marginBottom: 48 }}>
        <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 10 }}>Atlas scores are derived from CMS Medicare Part B data, which may occasionally contain inaccuracies. If you believe a score reflects a data error, contact us to flag the issue.</p>
        <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, margin: 0 }}>
          Email <a href="mailto:admin@matchmed.app" style={{ color: '#185FA5' }}>admin@matchmed.app</a> with subject line <strong>Data Inquiry – [Practice Name]</strong>.
        </p>
      </div>

      <div style={{ padding: 24, border: '0.5px solid #e8e8e8', borderRadius: 10, background: '#f9f9f9' }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#999', marginBottom: 12 }}>Legal &amp; Methodological Disclaimers</div>
        <p style={{ fontSize: 12, color: '#888', lineHeight: 1.7, margin: '0 0 10px' }}>All scores are derived from CMS Medicare Part B public datasets. MatchMed makes no representations regarding the completeness, accuracy, or timeliness of underlying CMS data.</p>
        <p style={{ fontSize: 12, color: '#888', lineHeight: 1.7, margin: '0 0 10px' }}>Scores are statistical estimates, not factual declarations. They do not establish causation or assign blame for physician departures.</p>
        <p style={{ fontSize: 12, color: '#888', lineHeight: 1.7, margin: 0 }}>MatchMed, LLC is not liable for any employment, contracting, or other decisions made in reliance on Atlas scores. Use is subject to our <Link href="/terms-and-conditions" style={{ color: '#185FA5' }}>Terms of Service</Link> and <Link href="/privacy-policy" style={{ color: '#185FA5' }}>Privacy Policy</Link>.</p>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#999', margin: '40px 0 16px', paddingBottom: 8, borderBottom: '0.5px solid #e8e8e8' }}>
      {children}
    </div>
  )
}

function ScoreCard({ title, weight, weightColor = '#185FA5', weightBg = '#e6f1fb', children }: { title: string; weight: string; weightColor?: string; weightBg?: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '0.5px solid #e0e0e0', borderRadius: 10, padding: '20px 24px', marginBottom: 12, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>{title}</div>
        <span style={{ fontSize: 12, fontWeight: 600, color: weightColor, background: weightBg, padding: '3px 10px', borderRadius: 20 }}>{weight}</span>
      </div>
      {children}
    </div>
  )
}
