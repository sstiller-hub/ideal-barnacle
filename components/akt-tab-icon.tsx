interface AktTabIconProps {
  size?: number;
  active?: boolean;
  className?: string;
}

export function AktTabIcon({ size = 20, active = false, className = "" }: AktTabIconProps) {
  const opacity = active ? 1 : 0.6;
  
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ opacity }}
    >
      {/* Data bars forming implied delta - simplified for tab bar */}
      <line x1="10" y1="85" x2="90" y2="85" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.5"/>
      <line x1="16" y1="73" x2="84" y2="73" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.6"/>
      <line x1="22" y1="61" x2="78" y2="61" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.7"/>
      <line x1="28" y1="49" x2="72" y2="49" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.8"/>
      <line x1="34" y1="37" x2="66" y2="37" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.9"/>
      <line x1="40" y1="25" x2="60" y2="25" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.95"/>
      <line x1="46" y1="13" x2="54" y2="13" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" opacity="1"/>
    </svg>
  );
}
