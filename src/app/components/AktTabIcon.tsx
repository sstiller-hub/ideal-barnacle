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
      
      {/* Set 1 - Full progression */}
      <rect x="10" y="38" width="3" height="14" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.95} />
      <rect x="14" y="38" width="3" height="14" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.95} />
      <rect x="18" y="32" width="3" height="20" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.85} />
      <rect x="22" y="32" width="3" height="20" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.85} />
      <rect x="26" y="24" width="3" height="28" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.75} />
      
      {/* Set 2 - Medium progression */}
      <rect x="33" y="38" width="3" height="14" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.9} />
      <rect x="37" y="38" width="3" height="14" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.9} />
      <rect x="41" y="32" width="3" height="20" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.8} />
      
      {/* Set 3 - Light progression */}
      <rect x="48" y="38" width="3" height="14" rx="0.5" fill="currentColor" opacity={activeOpacity * 0.85} />
      
      {/* Subtle base line */}
      <line x1="10" y1="53" x2="51" y2="53" stroke="currentColor" strokeWidth="0.5" opacity={activeOpacity * 0.2} />
    </svg>
  );
}
