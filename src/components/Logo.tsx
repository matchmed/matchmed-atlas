interface LogoProps {
    size?: 'sm' | 'md' | 'lg'
    reversed?: boolean
  }
  
  export default function Logo({ size = 'md', reversed = false }: LogoProps) {
    const iconSize = size === 'sm' ? 24 : size === 'lg' ? 40 : 28
    const atlasFontSize = size === 'sm' ? 18 : size === 'lg' ? 32 : 22
    const byFontSize = size === 'sm' ? 9 : size === 'lg' ? 13 : 11
    const radius = size === 'sm' ? 5 : size === 'lg' ? 9 : 6
  
    const bg = reversed ? '#EAE3CF' : '#1C4A45'
    const fg = reversed ? '#1C4A45' : '#EAE3CF'
    const dot = reversed ? '#EAE3CF' : '#1C4A45'
    const atlasColor = reversed ? '#F7F5EF' : '#1C4A45'
    const byColor = reversed ? '#9DB6B0' : '#5E7A75'
  
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{
          width: iconSize,
          height: iconSize,
          background: bg,
          borderRadius: radius,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg
            width={Math.round(iconSize * 0.62)}
            height={Math.round(iconSize * 0.62)}
            viewBox="0 0 100 100"
            fill="none"
            aria-hidden="true"
          >
            <polygon
              points="50,8 57,43 92,50 57,57 50,92 43,57 8,50 43,43"
              fill={fg}
            />
            <circle cx="50" cy="50" r="5.5" fill={dot} />
          </svg>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{
            fontFamily: 'var(--font-display), Georgia, serif',
            fontWeight: 600,
            fontSize: atlasFontSize,
            color: atlasColor,
            lineHeight: 1,
            letterSpacing: '-0.01em',
          }}>
            Atlas
          </span>
          <span style={{
            fontFamily: 'var(--font-sans), system-ui, sans-serif',
            fontWeight: 500,
            fontSize: byFontSize,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: byColor,
            lineHeight: 1,
            paddingBottom: 1,
          }}>
            by MatchMed
          </span>
        </div>
      </div>
    )
  }