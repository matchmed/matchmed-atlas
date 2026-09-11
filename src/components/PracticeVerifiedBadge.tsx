const TOOLTIP =
  'Atlas has verified an authorized practice representative. Practice-reported information is labeled separately.'

export default function PracticeVerifiedBadge() {
  return (
    <span className="practice-verified-badge" title={TOOLTIP} aria-label="Verified profile">
      <svg
        className="practice-verified-badge-icon"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        aria-hidden="true"
        focusable="false"
      >
        <path
          fill="#1C4A45"
          d="M9.57 2.15a3.07 3.07 0 0 1 4.86 0l.5.59c.4.47 1.04.7 1.67.6l.76-.12a3.07 3.07 0 0 1 3.43 3.43l-.12.76c-.1.63.13 1.27.6 1.67l.59.5a3.07 3.07 0 0 1 0 4.86l-.59.5c-.47.4-.7 1.04-.6 1.67l.12.76a3.07 3.07 0 0 1-3.43 3.43l-.76-.12c-.63-.1-1.27.13-1.67.6l-.5.59a3.07 3.07 0 0 1-4.86 0l-.5-.59c-.4-.47-1.04-.7-1.67-.6l-.76.12a3.07 3.07 0 0 1-3.43-3.43l.12-.76c.1-.63-.13-1.27-.6-1.67l-.59-.5a3.07 3.07 0 0 1 0-4.86l.59-.5c.47-.4.7-1.04.6-1.67l-.12-.76A3.07 3.07 0 0 1 7.4 3.22l.76.12c.63.1 1.27-.13 1.67-.6l.5-.59z"
        />
        <path
          fill="none"
          stroke="#fff"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M7.6 12.2l2.8 2.8 6-6"
        />
      </svg>
      <span className="practice-verified-badge-label">Verified profile</span>
    </span>
  )
}
