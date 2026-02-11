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
      {/* Horizontal bar chart forming "A" shape - no background */}
      
      {/* Top apex */}
      <rect x="29" y="16" width="6" height="2.5" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.95} />
      
      {/* Left leg (bars extending from center-left outward as you go down) */}
      <rect x="27" y="21" width="8" height="2.5" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.9} />
      <rect x="25" y="26" width="10" height="2.5" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.85} />
      <rect x="23" y="31" width="12" height="2.5" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.8} />
      <rect x="21" y="36" width="14" height="2.5" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.75} />
      
      {/* Crossbar */}
      <rect x="21" y="36" width="22" height="2.5" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.95} />
      
      {/* Right leg (bars extending from center-right outward as you go down) */}
      <rect x="29" y="21" width="8" height="2.5" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.9} />
      <rect x="29" y="26" width="10" height="2.5" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.85} />
      <rect x="29" y="31" width="12" height="2.5" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.8} />
      <rect x="29" y="36" width="14" height="2.5" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.75} />
      
      {/* Bottom bars */}
      <rect x="19" y="41" width="16" height="2.5" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.7} />
      <rect x="29" y="41" width="16" height="2.5" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.7} />
      
      <rect x="17" y="46" width="18" height="2.5" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.65} />
      <rect x="29" y="46" width="18" height="2.5" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.65} />
      
      {/* Subtle base line */}
      <line x1="17" y1="51" x2="47" y2="51" stroke="currentColor" strokeWidth="0.5" opacity={activeOpacity * 0.2} />
    </svg>
  );
}
