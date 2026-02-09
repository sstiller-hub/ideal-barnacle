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
      {/* Simplified version for tab bar - no background, just the rings */}
      
      {/* Outer ring - Volume progression */}
      <circle
        cx="32"
        cy="32"
        r="22"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="138.23 138.23"
        strokeDashoffset="24"
        opacity={active ? 0.95 : 0.7}
      />
      
      {/* Middle ring - Intensity */}
      <circle
        cx="32"
        cy="32"
        r="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="100.53 100.53"
        strokeDashoffset="15"
        opacity={active ? 0.85 : 0.6}
      />
      
      {/* Inner ring - Frequency */}
      <circle
        cx="32"
        cy="32"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="62.83 62.83"
        strokeDashoffset="8"
        opacity={active ? 0.75 : 0.5}
      />
      
      {/* Center dot - Current session/focus point */}
      <circle
        cx="32"
        cy="32"
        r="3"
        fill="currentColor"
        opacity={active ? 0.9 : 0.6}
      />
    </svg>
  );
}
