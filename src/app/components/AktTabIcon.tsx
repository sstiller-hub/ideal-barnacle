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
      {/* Simplified rings for tab bar - no background */}
      
      {/* Outer ring (Volume) */}
      <path
        d="M 32 12
           A 20 20 0 1 1 47 32
           A 20 20 0 0 1 32 52
           A 20 20 0 0 1 17 32
           A 20 20 0 0 1 26 15"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        opacity={active ? 0.95 : 0.7}
      />
      
      {/* Middle ring (Intensity) */}
      <path
        d="M 32 16
           A 16 16 0 1 1 43 32
           A 16 16 0 0 1 32 48
           A 16 16 0 0 1 21 32
           A 16 16 0 0 1 27.5 18"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
        opacity={active ? 0.85 : 0.6}
      />
      
      {/* Inner ring (Frequency) */}
      <path
        d="M 32 20
           A 12 12 0 1 1 39 32
           A 12 12 0 0 1 32 44
           A 12 12 0 0 1 25 32
           A 12 12 0 0 1 29 21.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity={active ? 0.75 : 0.5}
      />
      
      {/* Vertical stem on the right to complete lowercase 'a' look */}
      <line
        x1="44"
        y1="26"
        x2="44"
        y2="42"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity={active ? 0.95 : 0.7}
      />
      
      <line
        x1="42"
        y1="27"
        x2="42"
        y2="41"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity={active ? 0.85 : 0.6}
      />
      
      <line
        x1="40"
        y1="28"
        x2="40"
        y2="40"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity={active ? 0.75 : 0.5}
      />
    </svg>
  );
}
