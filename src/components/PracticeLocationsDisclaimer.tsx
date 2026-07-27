'use client'

import { useId, useState } from 'react'

const DISCLAIMER =
  'These sites are billing locations listed distinctly by CMS. They may not include every physical location where this practice operates. CMS may also list the same physical location multiple times for different departments or billing centers.'

export default function PracticeLocationsDisclaimer() {
  const tooltipId = useId()
  const [open, setOpen] = useState(false)

  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
        verticalAlign: 'middle',
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="About these locations"
        aria-describedby={open ? tooltipId : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={{
          background: 'none',
          border: 'none',
          padding: 2,
          margin: 0,
          cursor: 'help',
          color: open ? '#1C4A45' : '#aaa',
          lineHeight: 0,
          display: 'inline-flex',
          borderRadius: 4,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <path strokeLinecap="round" d="M12 16v-4M12 8h.01" />
        </svg>
      </button>
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          style={{
            position: 'absolute',
            left: 0,
            top: 'calc(100% + 8px)',
            zIndex: 40,
            width: 260,
            padding: '10px 12px',
            fontSize: 12,
            lineHeight: 1.45,
            fontWeight: 400,
            color: '#444',
            background: '#fff',
            border: '1px solid #e8e8e8',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            whiteSpace: 'normal',
          }}
        >
          {DISCLAIMER}
        </span>
      )}
    </span>
  )
}
