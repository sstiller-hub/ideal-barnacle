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
      
      {/* Three concentric rings with gaps positioned to form lowercase 'a' */}
      {/* Gaps positioned: top-right area for opening, right side for stem */}
      
      {/* Outer ring (Volume) - lightest */}
      <path
        d="M 32 12
           A 20 20 0 1 1 47 32
           A 20 20 0 0 1 32 52
           A 20 20 0 0 1 17 32
           A 20 20 0 0 1 26 15"
        stroke="#E5E5E5"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        opacity="0.95"
      />
      
      {/* Middle ring (Intensity) */}
      <path
        d="M 32 16
           A 16 16 0 1 1 43 32
           A 16 16 0 0 1 32 48
           A 16 16 0 0 1 21 32
           A 16 16 0 0 1 27.5 18"
        stroke="#C0C0C0"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.85"
      />
      
      {/* Inner ring (Frequency) - darkest */}
      <path
        d="M 32 20
           A 12 12 0 1 1 39 32
           A 12 12 0 0 1 32 44
           A 12 12 0 0 1 25 32
           A 12 12 0 0 1 29 21.5"
        stroke="#8A8A8A"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.75"
      />
      
      {/* Vertical stem on the right to complete lowercase 'a' look */}
      <line
        x1="44"
        y1="26"
        x2="44"
        y2="42"
        stroke="#E5E5E5"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.95"
      />
      
      <line
        x1="42"
        y1="27"
        x2="42"
        y2="41"
        stroke="#C0C0C0"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.85"
      />
      
      <line
        x1="40"
        y1="28"
        x2="40"
        y2="40"
        stroke="#8A8A8A"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.75"
      />
    </svg>
  );
}
