'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Step = 'input' | 'review' | 'report'

interface FormValues {
  clientName: string
  contact: string
  market: string
  specialty: string
  radius: string
  date: string
  pipelineTitle: string
  pipelineSchools: string
  regionalTable: string
  pipelineTable: string
}

interface TableRow {
  [key: string]: string
}

interface ParsedData {
  regionalRows: TableRow[]
  pipelineRows: TableRow[]
  medians: Record<string, number>
  regionalHeaders: string[]
  pipelineHeaders: string[]
}

interface AiContent {
  summary: string
  stats: { value: string; label: string }[]
  findings: string
  pipelineDescription: string
}

const EMPTY_FORM: FormValues = {
  clientName: '',
  contact: '',
  market: '',
  specialty: 'Ophthalmology',
  radius: '50',
  date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  pipelineTitle: 'Fellowship & Residency Pipeline',
  pipelineSchools: '',
  regionalTable: '',
  pipelineTable: '',
}

const EMPTY_AI: AiContent = {
  summary: '',
  stats: Array.from({ length: 6 }, () => ({ value: '', label: '' })),
  findings: '',
  pipelineDescription: '',
}

function parseMarkdownTable(text: string): { headers: string[]; rows: TableRow[] } {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
  const tableLines = lines.filter(l => l.includes('|'))
  if (tableLines.length < 2) return { headers: [], rows: [] }

  const splitRow = (line: string) =>
    line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(c => c.trim())

  const headers = splitRow(tableLines[0])
  const rows: TableRow[] = []

  for (let i = 1; i < tableLines.length; i++) {
    const cells = splitRow(tableLines[i])
    if (cells.every(c => /^[-:]+$/.test(c))) continue
    const row: TableRow = {}
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? ''
    })
    rows.push(row)
  }

  return { headers, rows }
}

function parseNumber(value: string): number | null {
  const n = parseFloat(value.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function computeMedians(headers: string[], rows: TableRow[]): Record<string, number> {
  const medians: Record<string, number> = {}
  for (const header of headers) {
    const values = rows
      .map(r => parseNumber(r[header] ?? ''))
      .filter((n): n is number => n !== null)
    if (values.length === 0) continue
    values.sort((a, b) => a - b)
    const mid = Math.floor(values.length / 2)
    medians[header] =
      values.length % 2 === 0
        ? (values[mid - 1] + values[mid]) / 2
        : values[mid]
  }
  return medians
}

function findColumn(headers: string[], patterns: RegExp[]): string | null {
  return headers.find(h => patterns.some(p => p.test(h))) ?? null
}

function buildPrompt(parsed: ParsedData, form: FormValues): string {
  return `You are writing content for an Atlas Market Intelligence Report for ophthalmology physician recruitment.

Return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "summary": "2-3 sentence executive summary",
  "stats": [
    {"value": "string", "label": "string"},
    ...exactly 6 items with compelling market statistics derived from the data
  ],
  "findings": "3-5 bullet points as a single string, separated by newlines, each starting with •",
  "pipelineDescription": "2-3 sentences describing the fellowship/residency pipeline opportunity"
}

Client: ${form.clientName}
Contact: ${form.contact}
Market: ${form.market}
Specialty: ${form.specialty}
Radius: ${form.radius} miles
Pipeline title: ${form.pipelineTitle}
Pipeline schools: ${form.pipelineSchools}

Regional practice data (${parsed.regionalRows.length} practices):
${JSON.stringify(parsed.regionalRows, null, 2)}

Computed medians:
${JSON.stringify(parsed.medians, null, 2)}

Pipeline candidate data (${parsed.pipelineRows.length} rows):
${JSON.stringify(parsed.pipelineRows, null, 2)}`
}

function extractAiJson(response: { content?: { type: string; text?: string }[] }): AiContent {
  const text = response.content?.find(c => c.type === 'text')?.text ?? ''
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
  const parsed = JSON.parse(cleaned) as Partial<AiContent>
  return {
    summary: parsed.summary ?? '',
    stats: (parsed.stats ?? []).slice(0, 6).map(s => ({
      value: s?.value ?? '',
      label: s?.label ?? '',
    })),
    findings: parsed.findings ?? '',
    pipelineDescription: parsed.pipelineDescription ?? '',
  }
}

function classifyQuadrant(
  row: TableRow,
  scoreCol: string | null,
  rosterCol: string | null,
  medians: Record<string, number>,
): 'q1' | 'q2' | 'q3' | 'q4' | null {
  if (!scoreCol || !rosterCol) return null
  const score = parseNumber(row[scoreCol] ?? '')
  const roster = parseNumber(row[rosterCol] ?? '')
  const scoreMed = medians[scoreCol]
  const rosterMed = medians[rosterCol]
  if (score === null || roster === null || scoreMed === undefined || rosterMed === undefined) return null
  const highScore = score >= scoreMed
  const largeRoster = roster >= rosterMed
  if (highScore && largeRoster) return 'q1'
  if (highScore && !largeRoster) return 'q2'
  if (!highScore && largeRoster) return 'q3'
  return 'q4'
}

function buildReportHtml(
  form: FormValues,
  parsed: ParsedData,
  ai: AiContent,
): string {
  const scoreCol = findColumn(parsed.regionalHeaders, [/retention/i, /score/i, /atlas/i])
  const rosterCol = findColumn(parsed.regionalHeaders, [/roster/i, /physician/i, /size/i, /count/i])
  const nameCol = findColumn(parsed.regionalHeaders, [/practice/i, /name/i, /organization/i]) ?? parsed.regionalHeaders[0]

  const quadrants: Record<string, TableRow[]> = { q1: [], q2: [], q3: [], q4: [] }
  for (const row of parsed.regionalRows) {
    const q = classifyQuadrant(row, scoreCol, rosterCol, parsed.medians)
    if (q) quadrants[q].push(row)
  }

  const statsHtml = ai.stats
    .filter(s => s.value || s.label)
    .map(s => `
      <div class="stat-card">
        <div class="stat-value">${escapeHtml(s.value)}</div>
        <div class="stat-label">${escapeHtml(s.label)}</div>
      </div>`)
    .join('')

  const regionalRowsHtml = parsed.regionalRows
    .map(row => {
      const cells = parsed.regionalHeaders
        .map(h => `<td>${escapeHtml(row[h] ?? '')}</td>`)
        .join('')
      return `<tr>${cells}</tr>`
    })
    .join('')

  const regionalHeadHtml = parsed.regionalHeaders
    .map(h => `<th>${escapeHtml(h)}</th>`)
    .join('')

  const pipelineRowsHtml = parsed.pipelineRows
    .map(row => {
      const cells = parsed.pipelineHeaders
        .map(h => `<td>${escapeHtml(row[h] ?? '')}</td>`)
        .join('')
      return `<tr>${cells}</tr>`
    })
    .join('')

  const pipelineHeadHtml = parsed.pipelineHeaders
    .map(h => `<th>${escapeHtml(h)}</th>`)
    .join('')

  const quadrantLabel = (q: string) => {
    const labels: Record<string, string> = {
      q1: 'High Retention · Large Roster',
      q2: 'High Retention · Small Roster',
      q3: 'Lower Retention · Large Roster',
      q4: 'Lower Retention · Small Roster',
    }
    return labels[q] ?? q
  }

  const quadrantHtml = (['q1', 'q2', 'q3', 'q4'] as const)
    .map(q => {
      const items = quadrants[q]
        .slice(0, 8)
        .map(r => `<li>${escapeHtml(r[nameCol ?? ''] ?? Object.values(r)[0] ?? '')}</li>`)
        .join('')
      return `
        <div class="quadrant">
          <div class="quadrant-label">${quadrantLabel(q)}</div>
          <div class="quadrant-count">${items ? `${quadrants[q].length} practices` : '—'}</div>
          <ul>${items || '<li class="empty">No practices in this quadrant</li>'}</ul>
        </div>`
    })
    .join('')

  const findingsHtml = ai.findings
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => `<li>${escapeHtml(line.replace(/^•\s*/, ''))}</li>`)
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Market Intelligence Report — ${escapeHtml(form.clientName)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #141210; font-size: 11pt; line-height: 1.5; }
  h1, h2, h3 { font-family: Georgia, 'Times New Roman', serif; font-weight: 600; color: #1C4A45; }
  .page { padding: 48px 56px; page-break-after: always; min-height: 100vh; }
  .page:last-child { page-break-after: auto; }
  .cover { display: flex; flex-direction: column; justify-content: center; min-height: 100vh; background: #F7F6F2; }
  .eyebrow { font-size: 9pt; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #5E7A75; margin-bottom: 16px; }
  .cover h1 { font-size: 32pt; line-height: 1.15; margin-bottom: 12px; color: #141210; }
  .cover-sub { font-size: 14pt; color: #5E7A75; margin-bottom: 40px; }
  .cover-meta { font-size: 11pt; color: #8A8680; line-height: 1.8; }
  .cover-brand { margin-top: auto; padding-top: 48px; font-size: 10pt; color: #1C4A45; font-weight: 600; letter-spacing: 0.05em; }
  .section-title { font-size: 18pt; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 2px solid #1C4A45; }
  .section-sub { font-size: 10pt; color: #8A8680; margin-bottom: 24px; }
  .summary { font-size: 12pt; line-height: 1.7; color: #333; margin-bottom: 28px; }
  .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 28px; }
  .stat-card { background: #fff; border: 1px solid #e0ddd8; border-radius: 8px; padding: 16px; text-align: center; }
  .stat-value { font-size: 22pt; font-weight: 700; color: #1C4A45; line-height: 1.1; }
  .stat-label { font-size: 9pt; color: #8A8680; margin-top: 6px; line-height: 1.3; }
  .findings { margin-bottom: 28px; }
  .findings ul { padding-left: 20px; }
  .findings li { margin-bottom: 6px; color: #333; }
  .quadrant-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
  .quadrant { border: 1px solid #e0ddd8; border-radius: 8px; padding: 16px; background: #fff; min-height: 160px; }
  .quadrant-label { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #1C4A45; margin-bottom: 4px; }
  .quadrant-count { font-size: 9pt; color: #8A8680; margin-bottom: 10px; }
  .quadrant ul { padding-left: 16px; font-size: 10pt; }
  .quadrant li { margin-bottom: 3px; }
  .quadrant li.empty { list-style: none; margin-left: -16px; color: #aaa; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-top: 12px; }
  th { background: #F7F6F2; color: #1C4A45; font-weight: 600; text-align: left; padding: 8px 10px; border-bottom: 2px solid #e0ddd8; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.04em; }
  td { padding: 7px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
  tr:nth-child(even) td { background: #fafaf8; }
  .pipeline-desc { font-size: 11pt; color: #444; margin-bottom: 16px; line-height: 1.6; }
  .methodology p { margin-bottom: 12px; color: #444; font-size: 10.5pt; }
  .methodology h3 { font-size: 12pt; margin: 20px 0 8px; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { padding: 36px 48px; }
  }
</style>
</head>
<body>

<div class="page cover">
  <div class="eyebrow">Atlas Market Intelligence</div>
  <h1>${escapeHtml(form.clientName)}</h1>
  <div class="cover-sub">${escapeHtml(form.market)} · ${escapeHtml(form.specialty)} · ${escapeHtml(form.radius)}-mile radius</div>
  <div class="cover-meta">
    Prepared for ${escapeHtml(form.contact)}<br />
    ${escapeHtml(form.date)}
  </div>
  <div class="cover-brand">ATLAS BY MATCHMED</div>
</div>

<div class="page">
  <h2 class="section-title">Executive Summary</h2>
  <p class="section-sub">${escapeHtml(form.market)} ophthalmology market overview</p>
  <p class="summary">${escapeHtml(ai.summary)}</p>
  <div class="stats-grid">${statsHtml}</div>
  <div class="findings">
    <h3>Key Findings</h3>
    <ul>${findingsHtml}</ul>
  </div>
</div>

<div class="page">
  <h2 class="section-title">Quadrant Framework</h2>
  <p class="section-sub">Practices classified by retention score and roster size relative to market medians</p>
  <div class="quadrant-grid">${quadrantHtml}</div>
</div>

<div class="page">
  <h2 class="section-title">Target Practice List</h2>
  <p class="section-sub">${parsed.regionalRows.length} practices in ${escapeHtml(form.market)}</p>
  <table>
    <thead><tr>${regionalHeadHtml}</tr></thead>
    <tbody>${regionalRowsHtml || '<tr><td colspan="99">No regional data provided</td></tr>'}</tbody>
  </table>
</div>

<div class="page">
  <h2 class="section-title">${escapeHtml(form.pipelineTitle)}</h2>
  <p class="pipeline-desc">${escapeHtml(ai.pipelineDescription)}</p>
  ${form.pipelineSchools ? `<p class="section-sub">Schools: ${escapeHtml(form.pipelineSchools)}</p>` : ''}
  <table>
    <thead><tr>${pipelineHeadHtml}</tr></thead>
    <tbody>${pipelineRowsHtml || '<tr><td colspan="99">No pipeline data provided</td></tr>'}</tbody>
  </table>
</div>

<div class="page methodology">
  <h2 class="section-title">Methodology</h2>
  <p>This report is generated using Atlas by MatchMed, an ophthalmology workforce intelligence platform. All practice retention scores, roster data, and physician career histories are derived exclusively from publicly available CMS Medicare Part B Provider Data. No proprietary, self-reported, or third-party data is used.</p>
  <h3>Retention Score</h3>
  <p>Measures a practice's historical ability to retain physicians, calculated from the complete longitudinal Medicare roster of every physician who has appeared at the practice since 2019. Higher scores indicate lower short-tenure attrition and stronger tenure depth.</p>
  <h3>Quadrant Framework</h3>
  <p>Practices are plotted against market medians for retention score and current roster size. Quadrant 1 (high retention, large roster) represents the most stable and established targets. Quadrant 4 (lower retention, small roster) may indicate higher turnover risk or early-stage practices.</p>
  <h3>Pipeline Analysis</h3>
  <p>Fellowship and residency pipeline data identifies graduating trainees affiliated with programs in the target geography, providing a forward-looking view of physician supply.</p>
  <p style="margin-top: 32px; font-size: 9pt; color: #8A8680;">© ${new Date().getFullYear()} MatchMed, LLC · Confidential — prepared exclusively for ${escapeHtml(form.clientName)}</p>
</div>

</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#444',
  marginBottom: 4,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 13,
  padding: '8px 11px',
  border: '1px solid #e0ddd8',
  borderRadius: 8,
  outline: 'none',
  boxSizing: 'border-box',
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 160,
  fontFamily: 'monospace',
  fontSize: 12,
  lineHeight: 1.5,
  resize: 'vertical',
}

export default function ReportBuilderPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [step, setStep] = useState<Step>('input')
  const [form, setForm] = useState<FormValues>(EMPTY_FORM)
  const [parsedData, setParsedData] = useState<ParsedData>({
    regionalRows: [],
    pipelineRows: [],
    medians: {},
    regionalHeaders: [],
    pipelineHeaders: [],
  })
  const [aiContent, setAiContent] = useState<AiContent>(EMPTY_AI)
  const [reportHtml, setReportHtml] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function check() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!profile?.is_admin) {
        router.replace('/')
        return
      }
      setAuthorized(true)
    }
    check()
  }, [router])

  function updateForm(field: keyof FormValues, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function parseTables(): ParsedData {
    const regional = parseMarkdownTable(form.regionalTable)
    const pipeline = parseMarkdownTable(form.pipelineTable)
    const medians = computeMedians(regional.headers, regional.rows)
    return {
      regionalRows: regional.rows,
      pipelineRows: pipeline.rows,
      medians,
      regionalHeaders: regional.headers,
      pipelineHeaders: pipeline.headers,
    }
  }

  async function handleGenerateAi() {
    setError('')
    const parsed = parseTables()
    if (parsed.regionalRows.length === 0) {
      setError('Please paste a regional markdown table with at least one data row.')
      return
    }
    setParsedData(parsed)
    setLoading(true)
    try {
      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: buildPrompt(parsed, form) }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate AI content')
      }
      const content = extractAiJson(data)
      while (content.stats.length < 6) {
        content.stats.push({ value: '', label: '' })
      }
      setAiContent(content)
      setStep('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate AI content')
    } finally {
      setLoading(false)
    }
  }

  function handleGenerateReport() {
    const html = buildReportHtml(form, parsedData, aiContent)
    setReportHtml(html)
    setStep('report')
  }

  function handlePrint() {
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(reportHtml)
    win.document.close()
    win.focus()
    win.print()
  }

  if (authorized === null) {
    return <div style={{ padding: 40, color: '#aaa', fontSize: 14 }}>Loading...</div>
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 48px' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: '#1C4A45', marginBottom: 6 }}>
          Admin
        </div>
        <h1 className="font-serif" style={{ fontSize: 24, fontWeight: 700, color: '#1a1a1a', marginBottom: 4 }}>
          Market Intelligence Report Builder
        </h1>
        <p style={{ fontSize: 13, color: '#888' }}>
          Generate print-ready Atlas market reports from regional and pipeline data.
        </p>
      </div>

      {error && (
        <div style={{ background: '#fdf2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#b91c1c' }}>
          {error}
        </div>
      )}

      {step === 'input' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {([
              ['clientName', 'Client name'],
              ['contact', 'Contact'],
              ['market', 'Market / region'],
              ['specialty', 'Specialty'],
              ['radius', 'Radius (miles)'],
              ['date', 'Report date'],
              ['pipelineTitle', 'Pipeline section title'],
              ['pipelineSchools', 'Pipeline schools'],
            ] as const).map(([field, label]) => (
              <div key={field}>
                <label style={labelStyle}>{label}</label>
                <input
                  style={inputStyle}
                  value={form[field]}
                  onChange={e => updateForm(field, e.target.value)}
                />
              </div>
            ))}
          </div>

          <div>
            <label style={labelStyle}>Regional practice table (markdown)</label>
            <textarea
              style={textareaStyle}
              placeholder={'| Practice | City | Retention Score | Roster |\n|----------|------|-----------------|--------|\n| ... | ... | ... | ... |'}
              value={form.regionalTable}
              onChange={e => updateForm('regionalTable', e.target.value)}
            />
          </div>

          <div>
            <label style={labelStyle}>Pipeline table (markdown)</label>
            <textarea
              style={textareaStyle}
              placeholder={'| Name | Program | Grad Year | Subspecialty |\n|------|---------|-----------|-------------|\n| ... | ... | ... | ... |'}
              value={form.pipelineTable}
              onChange={e => updateForm('pipelineTable', e.target.value)}
            />
          </div>

          <button
            onClick={handleGenerateAi}
            disabled={loading}
            style={{
              alignSelf: 'flex-start',
              padding: '11px 24px',
              background: loading ? '#8ab4ae' : '#1C4A45',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Generating with AI…' : 'Generate with AI'}
          </button>
        </div>
      )}

      {step === 'review' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <label style={labelStyle}>Executive summary</label>
            <textarea
              style={{ ...textareaStyle, minHeight: 100, fontFamily: 'inherit' }}
              value={aiContent.summary}
              onChange={e => setAiContent(prev => ({ ...prev, summary: e.target.value }))}
            />
          </div>

          <div>
            <label style={labelStyle}>Key statistics (6)</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {aiContent.stats.map((stat, i) => (
                <div key={i} style={{ display: 'flex', gap: 8 }}>
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder="Value"
                    value={stat.value}
                    onChange={e => {
                      const stats = [...aiContent.stats]
                      stats[i] = { ...stats[i], value: e.target.value }
                      setAiContent(prev => ({ ...prev, stats }))
                    }}
                  />
                  <input
                    style={{ ...inputStyle, flex: 2 }}
                    placeholder="Label"
                    value={stat.label}
                    onChange={e => {
                      const stats = [...aiContent.stats]
                      stats[i] = { ...stats[i], label: e.target.value }
                      setAiContent(prev => ({ ...prev, stats }))
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Key findings (one per line, prefix with •)</label>
            <textarea
              style={{ ...textareaStyle, minHeight: 120, fontFamily: 'inherit' }}
              value={aiContent.findings}
              onChange={e => setAiContent(prev => ({ ...prev, findings: e.target.value }))}
            />
          </div>

          <div>
            <label style={labelStyle}>Pipeline description</label>
            <textarea
              style={{ ...textareaStyle, minHeight: 80, fontFamily: 'inherit' }}
              value={aiContent.pipelineDescription}
              onChange={e => setAiContent(prev => ({ ...prev, pipelineDescription: e.target.value }))}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => setStep('input')}
              style={{ padding: '10px 20px', background: 'white', border: '1px solid #e0ddd8', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
            >
              Back
            </button>
            <button
              onClick={handleGenerateReport}
              style={{ padding: '10px 20px', background: '#1C4A45', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Generate Report
            </button>
          </div>
        </div>
      )}

      {step === 'report' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <button
              onClick={() => setStep('review')}
              style={{ padding: '10px 20px', background: 'white', border: '1px solid #e0ddd8', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
            >
              Edit
            </button>
            <button
              onClick={handlePrint}
              style={{ padding: '10px 20px', background: '#1C4A45', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Print / Save PDF
            </button>
          </div>
          <iframe
            srcDoc={reportHtml}
            title="Report preview"
            style={{ width: '100%', height: '80vh', border: 'none', display: 'block' }}
          />
        </div>
      )}
    </div>
  )
}
