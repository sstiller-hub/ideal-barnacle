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
      
      {/* Training cycle rings - inspired by activity tracking but adapted for strength */}
      {/* Outer ring - Volume progression */}
      <circle
        cx="32"
        cy="32"
        r="22"
        fill="none"
        stroke="#E5E5E5"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="138.23 138.23"
        strokeDashoffset="24"
        opacity="0.95"
      />
      
      {/* Middle ring - Intensity */}
      <circle
        cx="32"
        cy="32"
        r="16"
        fill="none"
        stroke="#C0C0C0"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="100.53 100.53"
        strokeDashoffset="15"
        opacity="0.85"
      />
      
      {/* Inner ring - Frequency */}
      <circle
        cx="32"
        cy="32"
        r="10"
        fill="none"
        stroke="#8A8A8A"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="62.83 62.83"
        strokeDashoffset="8"
        opacity="0.75"
      />
      
      {/* Center dot - Current session/focus point */}
      <circle
        cx="32"
        cy="32"
        r="3"
        fill="#FFFFFF"
        opacity="0.9"
      />
    </svg>
  );
}
