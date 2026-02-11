interface AktIconProps {
  size?: number;
  opacity?: number;
  className?: string;
}

export function AktIcon({ size = 28, opacity = 1, className = "" }: AktIconProps) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 64 64" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ opacity }}
    >
      {/* Dark matte background - near-black surface */}
      <defs>
        <linearGradient id="akt-dark-bg" x1="0" y1="0" x2="0" y2="64">
          <stop offset="0%" stopColor="#12121A" />
          <stop offset="100%" stopColor="#0D0D0F" />
        </linearGradient>
      </defs>
      
      <rect 
        x="0" 
        y="0" 
        width="64" 
        height="64" 
        rx="14" 
        fill="url(#akt-dark-bg)" 
      />
      
      {/* Horizontal bar chart forming "A" shape */}
      
      {/* Top apex */}
      <rect x="29" y="16" width="6" height="2.5" rx="0.5" fill="#E5E5E5" opacity="0.95" />
      
      {/* Left leg (bars extending from center-left outward as you go down) */}
      <rect x="27" y="21" width="8" height="2.5" rx="0.5" fill="#D8D8D8" opacity="0.9" />
      <rect x="25" y="26" width="10" height="2.5" rx="0.5" fill="#CCCCCC" opacity="0.85" />
      <rect x="23" y="31" width="12" height="2.5" rx="0.5" fill="#C0C0C0" opacity="0.8" />
      <rect x="21" y="36" width="14" height="2.5" rx="0.5" fill="#B0B0B0" opacity="0.75" />
      
      {/* Crossbar */}
      <rect x="21" y="36" width="22" height="2.5" rx="0.5" fill="#E5E5E5" opacity="0.95" />
      
      {/* Right leg (bars extending from center-right outward as you go down) */}
      <rect x="29" y="21" width="8" height="2.5" rx="0.5" fill="#D8D8D8" opacity="0.9" />
      <rect x="29" y="26" width="10" height="2.5" rx="0.5" fill="#CCCCCC" opacity="0.85" />
      <rect x="29" y="31" width="12" height="2.5" rx="0.5" fill="#C0C0C0" opacity="0.8" />
      <rect x="29" y="36" width="14" height="2.5" rx="0.5" fill="#B0B0B0" opacity="0.75" />
      
      {/* Bottom bars */}
      <rect x="19" y="41" width="16" height="2.5" rx="0.5" fill="#A0A0A0" opacity="0.7" />
      <rect x="29" y="41" width="16" height="2.5" rx="0.5" fill="#A0A0A0" opacity="0.7" />
      
      <rect x="17" y="46" width="18" height="2.5" rx="0.5" fill="#8A8A8A" opacity="0.65" />
      <rect x="29" y="46" width="18" height="2.5" rx="0.5" fill="#8A8A8A" opacity="0.65" />
      
      {/* Subtle base line */}
      <line x1="17" y1="51" x2="47" y2="51" stroke="#FFFFFF" strokeWidth="0.5" opacity="0.2" />
    </svg>
  );
}
