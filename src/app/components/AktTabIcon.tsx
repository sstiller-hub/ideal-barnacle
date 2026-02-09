interface AktTabIconProps {
  size?: number;
  active?: boolean;
  className?: string;
}

export function AktTabIcon({ size = 20, active = false, className = "" }: AktTabIconProps) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 64 64" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Simplified A design for tab bar - no background */}
      
      {/* Left diagonal stroke (outer) */}
      <path
        d="M 20 48 L 28 18"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity={active ? 0.95 : 0.7}
      />
      
      {/* Left diagonal stroke (middle) */}
      <path
        d="M 22 48 L 29.5 20"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity={active ? 0.85 : 0.6}
      />
      
      {/* Left diagonal stroke (inner) */}
      <path
        d="M 24 48 L 31 22"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={active ? 0.75 : 0.5}
      />
      
      {/* Right diagonal stroke (outer) */}
      <path
        d="M 44 48 L 36 18"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity={active ? 0.95 : 0.7}
      />
      
      {/* Right diagonal stroke (middle) */}
      <path
        d="M 42 48 L 34.5 20"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity={active ? 0.85 : 0.6}
      />
      
      {/* Right diagonal stroke (inner) */}
      <path
        d="M 40 48 L 33 22"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={active ? 0.75 : 0.5}
      />
      
      {/* Crossbar (outer) */}
      <line
        x1="24"
        y1="36"
        x2="40"
        y2="36"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity={active ? 0.95 : 0.7}
      />
      
      {/* Crossbar (middle) */}
      <line
        x1="24.5"
        y1="34.5"
        x2="39.5"
        y2="34.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity={active ? 0.85 : 0.6}
      />
      
      {/* Crossbar (inner) */}
      <line
        x1="25"
        y1="33"
        x2="39"
        y2="33"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={active ? 0.75 : 0.5}
      />
      
      {/* Peak dot */}
      <circle
        cx="32"
        cy="18"
        r="2.5"
        fill="currentColor"
        opacity={active ? 0.9 : 0.6}
      />
    </svg>
  );
}
