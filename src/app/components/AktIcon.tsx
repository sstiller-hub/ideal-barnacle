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
      
      {/* A-shaped design using angular strokes */}
      
      {/* Left diagonal stroke (outer) */}
      <path
        d="M 20 48 L 28 18"
        stroke="#E5E5E5"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.95"
      />
      
      {/* Left diagonal stroke (middle) */}
      <path
        d="M 22 48 L 29.5 20"
        stroke="#C0C0C0"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.85"
      />
      
      {/* Left diagonal stroke (inner) */}
      <path
        d="M 24 48 L 31 22"
        stroke="#8A8A8A"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.75"
      />
      
      {/* Right diagonal stroke (outer) */}
      <path
        d="M 44 48 L 36 18"
        stroke="#E5E5E5"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.95"
      />
      
      {/* Right diagonal stroke (middle) */}
      <path
        d="M 42 48 L 34.5 20"
        stroke="#C0C0C0"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.85"
      />
      
      {/* Right diagonal stroke (inner) */}
      <path
        d="M 40 48 L 33 22"
        stroke="#8A8A8A"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.75"
      />
      
      {/* Crossbar (outer) */}
      <line
        x1="24"
        y1="36"
        x2="40"
        y2="36"
        stroke="#E5E5E5"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.95"
      />
      
      {/* Crossbar (middle) */}
      <line
        x1="24.5"
        y1="34.5"
        x2="39.5"
        y2="34.5"
        stroke="#C0C0C0"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.85"
      />
      
      {/* Crossbar (inner) */}
      <line
        x1="25"
        y1="33"
        x2="39"
        y2="33"
        stroke="#8A8A8A"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.75"
      />
      
      {/* Peak dot */}
      <circle
        cx="32"
        cy="18"
        r="2.5"
        fill="#FFFFFF"
        opacity="0.9"
      />
    </svg>
  );
}
