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
      {/* Simplified plate viz bars forming "A" shape - no background */}
      
      {/* Left leg of A (ascending) */}
      <rect x="16" y="46" width="2.5" height="8" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.7} />
      <rect x="19" y="42" width="2.5" height="12" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.75} />
      <rect x="22" y="38" width="2.5" height="16" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.8} />
      <rect x="25" y="32" width="2.5" height="22" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.85} />
      <rect x="28" y="26" width="2.5" height="28" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.9} />
      
      {/* Right leg of A (descending) */}
      <rect x="33.5" y="26" width="2.5" height="28" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.9} />
      <rect x="36.5" y="32" width="2.5" height="22" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.85} />
      <rect x="39.5" y="38" width="2.5" height="16" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.8} />
      <rect x="42.5" y="42" width="2.5" height="12" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.75} />
      <rect x="45.5" y="46" width="2.5" height="8" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.7} />
      
      {/* Horizontal crossbar of A */}
      <rect x="22" y="40" width="20.5" height="2" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.95} />
      
      {/* Subtle base line */}
      <line x1="16" y1="54.5" x2="48" y2="54.5" stroke="currentColor" strokeWidth="0.5" opacity={activeOpacity * 0.2} />
    </svg>
  );
}
