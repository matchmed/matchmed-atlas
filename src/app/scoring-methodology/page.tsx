import Link from 'next/link'

export default function ScoringMethodologyPage() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', maxWidth: 720, margin: '0 auto', padding: '48px 0 80px', color: '#1a1a1a' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: '#1C4A45', marginBottom: 12 }}>Atlas by MatchMed</div>
      <h1 className="font-serif" style={{ fontSize: 28, fontWeight: 700, margin: '0 0 8px', lineHeight: 1.2 }}>About the scores</h1>
      <p style={{ fontSize: 15, color: '#666', margin: '0 0 40px', lineHeight: 1.6 }}>Every number on Atlas is derived from publicly available government data. No surveys, no self-reporting, no recruiter claims. Here's exactly what we measure and how.</p>

      {/* NEW: the defense, stated first */}
      <SectionLabel>What Atlas measures</SectionLabel>
      <div style={{ background: '#E8F0EF', borderLeft: '3px solid #1C4A45', borderRadius: '0 8px 8px 0', padding: '18px 22px', marginBottom: 24 }}>
        <p style={{ fontSize: 14, color: '#333', lineHeight: 1.7, margin: '0 0 12px' }}>
          Atlas measures <strong>physician movement</strong>, not practice quality. For any practice, we show a single verifiable thing: of the physicians who have appeared on its Medicare roster since 2019, how long each one stayed.
        </p>
        <p style={{ fontSize: 14, color: '#333', lineHeight: 1.7, margin: 0 }}>
          That is arithmetic on public record. Atlas does not know, and does not claim to know, <em>why</em> any physician joined or left. The scores are designed to help a physician decide <strong>what to ask</strong> before signing a contract — not to reach a conclusion on their behalf.
        </p>
      </div>

      <SectionLabel>Data source</SectionLabel>
      <div style={{ background: '#f5f5f5', borderRadius: 8, padding: '16px 18px', marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: '#444', lineHeight: 1.6, margin: 0 }}>
          <strong>Medicare Part B Provider Data, <a href="https://data.cms.gov/" target="_blank" rel="noopener" style={{ color: '#1C4A45' }}>Centers for Medicare &amp; Medicaid Services (CMS)</a>.</strong> This dataset captures physician-practice affiliations across annual snapshots. Atlas scores are calculated from 2019 onwards, using the complete longitudinal record of every physician who has appeared on a practice's Medicare roster. No proprietary, self-reported, or third-party data is used. Practices cannot edit, remove, or influence what appears in this data.
          <br /><br />
          <span style={{ fontSize: 12, color: '#888' }}>Atlas is not affiliated with, endorsed by, or sponsored by the Centers for Medicare &amp; Medicaid Services or any other federal agency.</span>
        </p>
      </div>

      {/* NEW: what the score protects against, surfaced early */}
      <SectionLabel>What the score is built to protect against</SectionLabel>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: '#444', marginBottom: 12 }}>A raw departure count would be misleading. Before any score is calculated, Atlas accounts for the ordinary, benign reasons physicians move on, so that a practice is not marked down for normal career events:</p>
      <ul style={{ fontSize: 13.5, lineHeight: 1.7, color: '#444', margin: '0 0 24px', paddingLeft: 20 }}>
        <li style={{ marginBottom: 8 }}><strong>Retirements are down-weighted.</strong> A long-tenured physician leaving near the end of a career carries minimal weight. It is not treated as attrition.</li>
        <li style={{ marginBottom: 8 }}><strong>Fellowship and training roles are excluded.</strong> A fellow who appears on a roster for a year or two and moves on does not affect a practice's score in any way.</li>
        <li style={{ marginBottom: 0 }}><strong>Single departures carry little signal.</strong> Any one physician may leave for entirely personal reasons. The score responds to <em>patterns</em> across many physicians, not to any individual exit.</li>
      </ul>

      <SectionLabel>The core idea</SectionLabel>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: '#444', marginBottom: 16 }}>Every physician who joins a practice either stays or leaves. A long stay is, on balance, a signal of a working relationship. A departure is the end of one. How long a physician stayed before leaving carries information worth weighing — a very short stay and a stay that ends right around the partnership stage are different signals, and Atlas weights them differently.</p>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: '#444', marginBottom: 24 }}>Atlas does not assign a reason to any departure. It records how long physicians stayed and surfaces the patterns, so a physician evaluating an opportunity knows where to ask harder questions.</p>

      <SectionLabel>The scores</SectionLabel>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: '#444', marginBottom: 16 }}>Each score is scaled 0–100. Higher reflects stronger physician retention.</p>

      <ScoreCard title="Attrition Resistance" weight="Primary component">
        <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 12 }}>Measures the weighted departure load of physicians who have left the practice. Rather than a simple exit count, each departure is weighted by how long the physician stayed. Shorter stays carry more weight, because they are more likely to reflect something worth investigating.</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
          <thead>
            <tr>
              {['Tenure at departure', 'Weight', 'What it suggests to ask'].map(h => (
                <th key={h} style={{ textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#999', padding: '6px 12px', borderBottom: '0.5px solid #e8e8e8' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['0 – 2 years', 'Highest', 'Early exits are worth asking about directly'],
              ['2 – 4 years', 'High', 'Ask what the path looked like on the way to partnership'],
              ['4 – 6 years', 'Moderate', 'Ask how partnership and growth decisions were made'],
              ['6 – 10 years', 'Low', 'Ambiguous. Many ordinary explanations'],
              ['10+ years', 'Minimal', 'Near-career-stage. Treated as low signal'],
            ].map(([tenure, weight, ask]) => (
              <tr key={tenure}>
                <td style={{ padding: '8px 12px', borderBottom: '0.5px solid #f2f2f2', color: '#444', fontSize: 13 }}>{tenure}</td>
                <td style={{ padding: '8px 12px', borderBottom: '0.5px solid #f2f2f2' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: weight === 'Highest' ? '#eef2f1' : weight === 'High' ? '#eef2f1' : weight === 'Moderate' ? '#eef2f1' : weight === 'Low' ? '#e8f4ee' : '#f0f0f0', color: weight === 'Highest' || weight === 'High' ? '#1C4A45' : weight === 'Moderate' ? '#1C4A45' : weight === 'Low' ? '#1A6B3A' : '#666' }}>{weight}</span>
                </td>
                <td style={{ padding: '8px 12px', borderBottom: '0.5px solid #f2f2f2', color: '#444', fontSize: 13 }}>{ask}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 12, color: '#1C4A45', background: '#E8F0EF', borderLeft: '3px solid #1C4A45', padding: '8px 12px', borderRadius: '0 6px 6px 0', lineHeight: 1.5 }}>
          Any individual departure may have a personal explanation, and Atlas assigns none. Across thousands of practices and eight years of data, idiosyncratic reasons average out. A practice with a repeated pattern of departures at a specific career stage is worth a closer look — whatever the explanation turns out to be.
        </div>
      </ScoreCard>

      <ScoreCard title="Tenure Strength" weight="Secondary component">
        <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 12 }}>Measures how long physicians currently at the practice have stayed. Calculated from the active roster only. Physicians who have already left no longer contribute to this metric.</p>
        <div style={{ fontSize: 12, color: '#1C4A45', background: '#E8F0EF', borderLeft: '3px solid #1C4A45', padding: '8px 12px', borderRadius: '0 6px 6px 0', lineHeight: 1.5 }}>
          Departed physicians should not continue to prop up a practice's score after they leave. Tenure Strength reflects the current workforce: the physicians who would actually be your colleagues if you join.
        </div>
      </ScoreCard>

      <ScoreCard title="Cluster Signals" weight="Score modifier" weightColor="#1C4A45" weightBg="#E8F0EF">
        <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 12 }}>Two pattern-level signals that apply a downward adjustment when triggered. Both respond to patterns across multiple physicians, not to any single departure.</p>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>Temporal cluster</div>
          <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, margin: '0 0 14px' }}>Fires when a concentration of departures occurs within a defined rolling window. This often coincides with a discrete event such as a leadership change or acquisition, and is worth asking about. Applies a <strong>downward adjustment</strong>.</p>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>Tenure similarity cluster</div>
          <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, margin: 0 }}>Fires when multiple physicians departed after a similar length of stay. A repeated exit point at the same career stage is a pattern worth understanding. Applies a <strong>downward adjustment</strong>.</p>
        </div>
      </ScoreCard>

      <ScoreCard title="Experience Level" weight="Context only" weightColor="#888" weightBg="#f5f5f5">
        <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 12 }}>Measures the collective seniority of the current roster. Derived from median years since medical school graduation. Displayed as context alongside the Retention Score but not included in the composite.</p>
        <div style={{ fontSize: 12, color: '#1C4A45', background: '#E8F0EF', borderLeft: '3px solid #1C4A45', padding: '8px 12px', borderRadius: '0 6px 6px 0', lineHeight: 1.5 }}>
          Experience level reflects practice maturity. Senior-heavy rosters can carry succession or transition considerations that would be incorrectly rewarded if folded into a retention composite, so this is shown as context only.
        </div>
      </ScoreCard>

      <ScoreCard title="Retention Score" weight="Composite">
        <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 12 }}>A weighted composite of Attrition Resistance and Tenure Strength, adjusted by cluster signals.</p>
        <div style={{ background: '#f5f5f5', borderRadius: 8, padding: '16px 20px', fontFamily: 'monospace', fontSize: 13, color: '#1a1a1a', marginBottom: 12, lineHeight: 1.8 }}>
          Retention Score =<br />
          &nbsp;&nbsp;[(<span style={{ color: '#1C4A45', fontWeight: 600 }}>Attrition Resistance</span> × primary weight)<br />
          &nbsp;&nbsp;+ (<span style={{ color: '#1C4A45', fontWeight: 600 }}>Tenure Strength</span> × secondary weight)]<br />
          &nbsp;&nbsp;× <span style={{ color: '#1C4A45', fontWeight: 600 }}>Cluster Modifier</span> (if applicable)
        </div>
        <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, margin: 0 }}>Specific component weights are proprietary.</p>
      </ScoreCard>

      <SectionLabel>Insights &amp; Observations</SectionLabel>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: '#444', marginBottom: 16 }}>Practice detail pages include a short insight derived from the same CMS-derived fields shown in the metrics. Insights are deterministic observations, not AI-generated advice.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={{ background: '#E8F0EF', borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1C4A45', marginBottom: 8, letterSpacing: '.04em', textTransform: 'uppercase' }}>Insights are</div>
          <ul style={{ fontSize: 13, color: '#444', lineHeight: 1.6, margin: 0, paddingLeft: 18 }}>
            <li style={{ marginBottom: 4 }}>Factual observations from CMS data</li>
            <li style={{ marginBottom: 4 }}>Descriptions of tenure and retention patterns</li>
            <li>Transparent about their data sources</li>
          </ul>
        </div>
        <div style={{ background: '#fff8f0', borderRadius: 8, padding: '14px 16px', border: '0.5px solid #f0d0a0' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#8a5a00', marginBottom: 8, letterSpacing: '.04em', textTransform: 'uppercase' }}>Insights are not</div>
          <ul style={{ fontSize: 13, color: '#555', lineHeight: 1.6, margin: 0, paddingLeft: 18 }}>
            <li style={{ marginBottom: 4 }}>Predictions of future performance</li>
            <li style={{ marginBottom: 4 }}>Risk assessments or warnings</li>
            <li style={{ marginBottom: 4 }}>Prescriptive recommendations</li>
            <li>Clinical or business advice</li>
          </ul>
        </div>
      </div>

      <p style={{ fontSize: 14, lineHeight: 1.7, color: '#444', marginBottom: 12 }}>Each insight follows this logic:</p>
      <ol style={{ fontSize: 13.5, lineHeight: 1.7, color: '#444', margin: '0 0 16px', paddingLeft: 20 }}>
        <li style={{ marginBottom: 4 }}>Extract facts from CMS data (tenure distribution, roster size, churn rate)</li>
        <li style={{ marginBottom: 4 }}>Identify patterns (for example top-heavy tenure or significant roster reduction)</li>
        <li style={{ marginBottom: 4 }}>Describe the observation factually</li>
        <li style={{ marginBottom: 4 }}>List assumptions that could affect interpretation</li>
        <li>Specify confidence (high for observed facts)</li>
      </ol>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {[
          {
            title: 'Concentrated long-tenure workforce',
            observation: 'Longer-tenure cohorts exceed newer cohorts with a high retention score.',
            describes: 'Concentrated experience and historical stability.',
            assumption: 'Long tenure may correlate with stability.',
            alt: 'Could reflect limited growth, geographic constraints, or market conditions.',
          },
          {
            title: 'Significant roster reduction',
            observation: 'Current roster size is 1 while all-time historical size exceeds 3.',
            describes: 'Observed reduction in active physician count.',
            assumption: 'Reduction is factual and measurable.',
            alt: 'Could be natural transition, acquisition, consolidation, or retirement.',
          },
          {
            title: 'High churn rate',
            observation: 'More than 40% of all-time physicians exited within 4 years.',
            describes: 'Elevated short-tenure exit rate.',
            assumption: 'High exit rate may reflect a challenging environment.',
            alt: 'Could be early-career rotation, competitive market, or voluntary transitions.',
          },
          {
            title: 'Insufficient data',
            observation: 'Fewer than 2 all-time physicians.',
            describes: 'Lack of historical data for pattern analysis.',
            assumption: 'None.',
            alt: 'Absence of data is itself factual.',
          },
        ].map(item => (
          <div key={item.title} style={{ border: '0.5px solid #e0e0e0', borderRadius: 8, padding: '14px 16px', background: '#fff' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>{item.title}</div>
            <p style={{ fontSize: 12.5, color: '#555', lineHeight: 1.55, margin: '0 0 4px' }}><strong>Observation:</strong> {item.observation}</p>
            <p style={{ fontSize: 12.5, color: '#555', lineHeight: 1.55, margin: '0 0 4px' }}><strong>What it describes:</strong> {item.describes}</p>
            <p style={{ fontSize: 12.5, color: '#555', lineHeight: 1.55, margin: '0 0 4px' }}><strong>Assumption:</strong> {item.assumption}</p>
            <p style={{ fontSize: 12.5, color: '#555', lineHeight: 1.55, margin: 0 }}><strong>Alternative interpretation:</strong> {item.alt}</p>
          </div>
        ))}
      </div>

      <div style={{ background: '#E8F0EF', borderLeft: '3px solid #1C4A45', borderRadius: '0 8px 8px 0', padding: '14px 18px', marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: '#333', lineHeight: 1.6, margin: 0 }}>
          <strong>Key principle:</strong> Atlas shows what the data reveals about physician tenure patterns. It does not predict outcomes or prescribe actions.
        </p>
      </div>

      <SectionLabel>What the score is not</SectionLabel>
      <div style={{ background: '#fff8f0', border: '0.5px solid #f0d0a0', borderRadius: 10, padding: '18px 22px', marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, margin: 0 }}>
          The Retention Score is <strong>not</strong> a measure of clinical quality, patient outcomes, compensation, or workplace culture, and it is not a judgment of any practice or any physician. It answers one question: <em>based on how physicians have historically moved through this practice, how well has it retained the people who joined it?</em>
          <br /><br />
          A lower score is not an accusation. It is a prompt to ask better questions. Use Atlas as one input in your due diligence, alongside site visits, peer conversations, and contract review with an attorney.
        </p>
      </div>

      <SectionLabel>For practices: data and corrections</SectionLabel>
      <div style={{ background: '#f9f9f9', border: '0.5px solid #e0e0e0', borderRadius: 10, padding: '20px 24px', marginBottom: 48 }}>
        <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 10 }}>Atlas scores are derived from CMS Medicare Part B data, which may occasionally contain inaccuracies. If you represent a practice and believe your data or score reflects an error, we want to correct it. Flagged practices are reviewed against the underlying CMS record, and confirmed data errors are corrected in the next update cycle.</p>
        <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, margin: 0 }}>
          Email <a href="mailto:admin@matchmed.app" style={{ color: '#1C4A45' }}>admin@matchmed.app</a> with subject line <strong>Data Inquiry – [Practice Name]</strong>. We aim to respond within five business days.
        </p>
      </div>

      <div style={{ padding: 24, border: '0.5px solid #e8e8e8', borderRadius: 10, background: '#f9f9f9' }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#999', marginBottom: 12 }}>Legal &amp; Methodological Disclaimers</div>
        <p style={{ fontSize: 12, color: '#888', lineHeight: 1.7, margin: '0 0 10px' }}>All scores are derived from CMS Medicare Part B public datasets. MatchMed makes no representations regarding the completeness, accuracy, or timeliness of underlying CMS data.</p>
        <p style={{ fontSize: 12, color: '#888', lineHeight: 1.7, margin: '0 0 10px' }}>Scores are statistical estimates derived from observed physician movement, not factual declarations about any practice. They do not establish causation or assign a reason for any physician's departure.</p>
        <p style={{ fontSize: 12, color: '#888', lineHeight: 1.7, margin: 0 }}>MatchMed, LLC is not liable for any employment, contracting, or other decisions made in reliance on Atlas scores. Use is subject to our <Link href="/terms-and-conditions" style={{ color: '#1C4A45' }}>Terms of Service</Link> and <Link href="/privacy-policy" style={{ color: '#1C4A45' }}>Privacy Policy</Link>.</p>
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

function ScoreCard({ title, weight, weightColor = '#1C4A45', weightBg = '#E8F0EF', children }: { title: string; weight: string; weightColor?: string; weightBg?: string; children: React.ReactNode }) {
  return (
    <div className="bg-canvas" style={{ border: '0.5px solid #e0e0e0', borderRadius: 10, padding: '20px 24px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>{title}</div>
        <span style={{ fontSize: 12, fontWeight: 600, color: weightColor, background: weightBg, padding: '3px 10px', borderRadius: 20 }}>{weight}</span>
      </div>
      {children}
    </div>
  )
}