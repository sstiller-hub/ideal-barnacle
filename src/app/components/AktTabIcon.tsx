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
      {/* Simplified barbell for tab bar - no background */}
      
      {/* Center bar (barbell) */}
      <rect
        x="12"
        y="30"
        width="40"
        height="4"
        rx="2"
        fill="currentColor"
        opacity={activeOpacity * 0.95}
      />
      
      {/* Left side plates */}
      <rect
        x="9"
        y="22"
        width="6"
        height="20"
        rx="1"
        fill="currentColor"
        opacity={activeOpacity * 0.9}
      />
      
      <rect
        x="11"
        y="24"
        width="4"
        height="16"
        rx="0.5"
        fill="currentColor"
        opacity={activeOpacity * 0.7}
      />
      
      <rect
        x="12.5"
        y="26"
        width="2.5"
        height="12"
        rx="0.5"
        fill="currentColor"
        opacity={activeOpacity * 0.5}
      />
      
      {/* Right side plates */}
      <rect
        x="49"
        y="22"
        width="6"
        height="20"
        rx="1"
        fill="currentColor"
        opacity={activeOpacity * 0.9}
      />
      
      <rect
        x="49"
        y="24"
        width="4"
        height="16"
        rx="0.5"
        fill="currentColor"
        opacity={activeOpacity * 0.7}
      />
      
      <rect
        x="49"
        y="26"
        width="2.5"
        height="12"
        rx="0.5"
        fill="currentColor"
        opacity={activeOpacity * 0.5}
      />
      
      {/* Collar clips */}
      <rect
        x="15"
        y="29"
        width="1"
        height="6"
        rx="0.5"
        fill="currentColor"
        opacity={activeOpacity * 0.6}
      />
      
      <rect
        x="48"
        y="29"
        width="1"
        height="6"
        rx="0.5"
        fill="currentColor"
        opacity={activeOpacity * 0.6}
      />
      
      {/* Timer indicator */}
      <circle cx="32" cy="14" r="1.5" fill="currentColor" opacity={activeOpacity * 0.8} />
      
      {/* Rep counter mark */}
      <line x1="34" y1="48" x2="34" y2="52" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity={activeOpacity * 0.8} />
    </svg>
  );
}
