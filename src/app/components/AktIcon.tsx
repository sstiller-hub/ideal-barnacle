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
      
      {/* Plate visualization bars - matching pairs are identical sizes */}
      
      {/* Set 1 - Full progression (5 plates) */}
      {/* Pair 1: Small plates (lightest) */}
      <rect x="10" y="40" width="2.5" height="12" rx="0.5" fill="#E5E5E5" opacity="0.95" />
      <rect x="13" y="40" width="2.5" height="12" rx="0.5" fill="#E5E5E5" opacity="0.95" />
      
      {/* Pair 2: Medium plates */}
      <rect x="16.5" y="36" width="2.5" height="16" rx="0.5" fill="#C0C0C0" opacity="0.85" />
      <rect x="19.5" y="36" width="2.5" height="16" rx="0.5" fill="#C0C0C0" opacity="0.85" />
      
      {/* Large plate (single, darkest) */}
      <rect x="23" y="30" width="3" height="22" rx="0.5" fill="#8A8A8A" opacity="0.75" />
      
      {/* Set 2 - Medium progression (3 plates) */}
      {/* Pair 1: Small plates */}
      <rect x="30" y="40" width="2.5" height="12" rx="0.5" fill="#E5E5E5" opacity="0.9" />
      <rect x="33" y="40" width="2.5" height="12" rx="0.5" fill="#E5E5E5" opacity="0.9" />
      
      {/* Large plate (single) */}
      <rect x="36.5" y="36" width="2.5" height="16" rx="0.5" fill="#C0C0C0" opacity="0.8" />
      
      {/* Set 3 - Light progression (1 plate) */}
      <rect x="43" y="40" width="2.5" height="12" rx="0.5" fill="#E5E5E5" opacity="0.85" />
      
      {/* Subtle base line */}
      <line x1="10" y1="53" x2="46" y2="53" stroke="#FFFFFF" strokeWidth="0.5" opacity="0.2" />
      
      {/* Top indicator - exercise label suggestion */}
      <rect x="10" y="12" width="20" height="2" rx="1" fill="#E5E5E5" opacity="0.6" />
      <rect x="10" y="17" width="14" height="1.5" rx="0.75" fill="#8A8A8A" opacity="0.5" />
    </svg>
  );
}
