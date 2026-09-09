'use client'

import { useRouter } from 'next/navigation'
import ConnectPracticeCta from '@/components/ConnectPracticeCta'
import {
  formatOpportunityCompensation,
  formatOpportunityStates,
  opportunityHorizonLabel,
  OPPORTUNITY_REASON_LABELS,
} from '@/lib/opportunity-labels'
import type { PhysicianOpportunity } from '@/lib/physician-opportunities'

function badge(text: string, color = '#1C4A45', bg = '#E8F0EF') {
  return (
    <span
      key={text}
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 500,
        color,
        background: bg,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  )
}

export default function OpportunityCard({
  opportunity,
  source = 'opportunity_list',
  showPracticeLink = true,
}: {
  opportunity: PhysicianOpportunity
  source?: string
  showPracticeLink?: boolean
}) {
  const router = useRouter()
  const geo = formatOpportunityStates(opportunity.practice_states)
  const reasons = opportunity.reasons
    .map((r) =>
      r.reason === 'other' && r.other_text
        ? r.other_text
        : OPPORTUNITY_REASON_LABELS[r.reason] ?? r.reason,
    )
    .filter(Boolean)

  return (
    <div
      style={{
        border: '1px solid #e8e8e8',
        borderRadius: 12,
        padding: '18px 20px',
        background: '#ffffff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 10,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: '#1C4A45',
              letterSpacing: '-0.01em',
              lineHeight: 1.3,
              cursor: showPracticeLink ? 'pointer' : 'default',
            }}
            onClick={() => {
              if (showPracticeLink) router.push(`/practices/${opportunity.practice_id}`)
            }}
          >
            {opportunity.practice_name || 'Practice'}
          </div>
          {geo && (
            <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>{geo}</div>
          )}
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <ConnectPracticeCta
            practiceId={opportunity.practice_id}
            opportunityId={opportunity.id}
            source={source}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {badge(opportunity.clinical_focus, '#1A6B3A', '#D4EDDA')}
        {badge(
          opportunityHorizonLabel(opportunity.hiring_horizon),
          opportunity.hiring_now ? '#C8640A' : '#1C4A45',
          opportunity.hiring_now ? '#FFF0E0' : '#E8F0EF',
        )}
      </div>

      <div style={{ fontSize: 13, color: '#555', lineHeight: 1.5, display: 'grid', gap: 4 }}>
        <div>
          Base compensation:{' '}
          {formatOpportunityCompensation(
            opportunity.base_compensation_min_usd,
            opportunity.base_compensation_max_usd,
            opportunity.base_compensation_max_is_open_ended,
          )}
        </div>
        {reasons.length > 0 && <div>Reason: {reasons.join(', ')}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
          {opportunity.productivity_structure_available && badge('Productivity structure')}
          {opportunity.signing_bonus_available && badge('Signing bonus')}
          {opportunity.relocation_assistance_available && badge('Relocation assistance')}
        </div>
        {opportunity.hiring_notes && (
          <div style={{ marginTop: 6, borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
            {opportunity.hiring_notes}
          </div>
        )}
        {opportunity.attribution_label && (
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 8 }}>
            {opportunity.attribution_label}
          </div>
        )}
      </div>

      {showPracticeLink && (
        <button
          type="button"
          onClick={() => router.push(`/practices/${opportunity.practice_id}`)}
          style={{
            marginTop: 12,
            fontSize: 12,
            color: '#1C4A45',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          View practice →
        </button>
      )}
    </div>
  )
}
