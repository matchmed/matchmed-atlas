import { createClient } from '@/lib/supabase-server'
import ReportsInboxClient, { type ReportRow } from './ReportsInboxClient'

export const dynamic = 'force-dynamic'

export default async function AdminReportsPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('practice_error_reports')
    .select(`
      id,
      practice_id,
      reported_by,
      field_flagged,
      description,
      snapshot,
      status,
      admin_notes,
      resolved_at,
      created_at,
      practice:practices!practice_error_reports_practice_id_fkey (
        id,
        practice_name,
        city_st,
        phone,
        website
      ),
      reporter:profiles!practice_error_reports_reported_by_fkey (
        id,
        first_name,
        last_name,
        email
      )
    `)
    .order('created_at', { ascending: false })

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 16px 56px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: '#1C4A45', marginBottom: 6 }}>
          Admin
        </div>
        <h1 className="font-serif" style={{ fontSize: 26, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.2, margin: '0 0 6px' }}>
          Practice Error Reports
        </h1>
        <p style={{ fontSize: 13, color: '#888', lineHeight: 1.5, margin: 0 }}>
          Review reported issues against current Atlas practice information.
        </p>
      </div>

      {error ? (
        <div style={{ padding: '12px 16px', border: '1px solid #fecaca', borderRadius: 8, background: '#fef2f2', color: '#b91c1c', fontSize: 13 }}>
          Reports could not be loaded. Confirm the practice error reports migration has been applied.
        </div>
      ) : (
        <ReportsInboxClient initialReports={(data ?? []) as unknown as ReportRow[]} />
      )}
    </div>
  )
}
