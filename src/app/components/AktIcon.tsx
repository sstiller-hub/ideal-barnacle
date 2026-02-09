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
      
      {/* Barbell plate visualization inspired icon */}
      {/* Center bar (barbell) */}
      <rect
        x="12"
        y="30"
        width="40"
        height="4"
        rx="2"
        fill="#E5E5E5"
        opacity="0.95"
      />
      
      {/* Left side plates (progressive loading) */}
      {/* Outer plate */}
      <rect
        x="9"
        y="22"
        width="6"
        height="20"
        rx="1"
        fill="#E5E5E5"
        opacity="0.9"
      />
      
      {/* Middle plate */}
      <rect
        x="11"
        y="24"
        width="4"
        height="16"
        rx="0.5"
        fill="#C0C0C0"
        opacity="0.8"
      />
      
      {/* Inner plate */}
      <rect
        x="12.5"
        y="26"
        width="2.5"
        height="12"
        rx="0.5"
        fill="#8A8A8A"
        opacity="0.7"
      />
      
      {/* Right side plates (progressive loading) */}
      {/* Outer plate */}
      <rect
        x="49"
        y="22"
        width="6"
        height="20"
        rx="1"
        fill="#E5E5E5"
        opacity="0.9"
      />
      
      {/* Middle plate */}
      <rect
        x="49"
        y="24"
        width="4"
        height="16"
        rx="0.5"
        fill="#C0C0C0"
        opacity="0.8"
      />
      
      {/* Inner plate */}
      <rect
        x="49"
        y="26"
        width="2.5"
        height="12"
        rx="0.5"
        fill="#8A8A8A"
        opacity="0.7"
      />
      
      {/* Collar clips */}
      <rect
        x="15"
        y="29"
        width="1"
        height="6"
        rx="0.5"
        fill="#FFFFFF"
        opacity="0.6"
      />
      
      <rect
        x="48"
        y="29"
        width="1"
        height="6"
        rx="0.5"
        fill="#FFFFFF"
        opacity="0.6"
      />
      
      {/* Timer/tracking indicator dots at top */}
      <circle cx="28" cy="14" r="1.5" fill="#E5E5E5" opacity="0.7" />
      <circle cx="32" cy="14" r="1.5" fill="#E5E5E5" opacity="0.9" />
      <circle cx="36" cy="14" r="1.5" fill="#E5E5E5" opacity="0.7" />
      
      {/* Rep counter marks at bottom */}
      <line x1="26" y1="48" x2="26" y2="52" stroke="#E5E5E5" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <line x1="30" y1="48" x2="30" y2="52" stroke="#E5E5E5" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <line x1="34" y1="48" x2="34" y2="52" stroke="#E5E5E5" strokeWidth="1.5" strokeLinecap="round" opacity="0.9" />
      <line x1="38" y1="48" x2="38" y2="52" stroke="#E5E5E5" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}
