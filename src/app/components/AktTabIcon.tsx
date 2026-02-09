interface AktTabIconProps {
  size?: number;
  active?: boolean;
  className?: string;
}

export function AktTabIcon({ size = 20, active = false, className = "" }: AktTabIconProps) {
  const activeOpacity = active ? 1 : 0.6;
  
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 64 64" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Simplified plate viz bars for tab bar - no background */}
      
      {/* Set 1 - Full progression (5 plates) */}
      {/* Pair 1: Small plates (lightest) */}
      <rect x="10" y="40" width="2.5" height="12" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.95} />
      <rect x="13" y="40" width="2.5" height="12" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.95} />
      
      {/* Pair 2: Medium plates */}
      <rect x="16.5" y="36" width="2.5" height="16" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.85} />
      <rect x="19.5" y="36" width="2.5" height="16" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.85} />
      
      {/* Large plate (single, darkest) */}
      <rect x="23" y="30" width="3" height="22" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.75} />
      
      {/* Set 2 - Medium progression (3 plates) */}
      {/* Pair 1: Small plates */}
      <rect x="30" y="40" width="2.5" height="12" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.9} />
      <rect x="33" y="40" width="2.5" height="12" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.9} />
      
      {/* Large plate (single) */}
      <rect x="36.5" y="36" width="2.5" height="16" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.8} />
      
      {/* Set 3 - Light progression (1 plate) */}
      <rect x="43" y="40" width="2.5" height="12" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.85} />
      
      {/* Subtle base line */}
      <line x1="10" y1="53" x2="46" y2="53" stroke="currentColor" strokeWidth="0.5" opacity={activeOpacity * 0.2} />
    </svg>
  );
}
