interface AktIconProps {
  size?: number;
  opacity?: number;
  className?: string;
  variant?: 'primary' | 'horizontal' | 'badge';
}

export function AktIcon({ 
  size = 28, 
  opacity = 1, 
  className = "",
  variant = 'primary'
}: AktIconProps) {
  if (variant === 'horizontal') {
    return (
      <div className={`flex items-center gap-3 ${className}`} style={{ opacity }}>
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
          <line x1="10" y1="85" x2="90" y2="85" stroke="#4A4A4A" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="16" y1="73" x2="84" y2="73" stroke="#5A5A5A" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="22" y1="61" x2="78" y2="61" stroke="#6A6A6A" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="28" y1="49" x2="72" y2="49" stroke="#7A7A7A" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="34" y1="37" x2="66" y2="37" stroke="#8A8A8A" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="40" y1="25" x2="60" y2="25" stroke="#9A9A9A" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="46" y1="13" x2="54" y2="13" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round"/>
        </svg>
        <span className="text-2xl font-bold tracking-tighter">AKT</span>
      </div>
    );
  }

  if (variant === 'badge') {
    return (
      <div 
        className={`rounded-2xl border-2 border-[#2A2A2A] bg-black flex items-center justify-center ${className}`}
        style={{ opacity, width: size * 2, height: size * 2 }}
      >
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
          <line x1="10" y1="85" x2="90" y2="85" stroke="#4A4A4A" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="16" y1="73" x2="84" y2="73" stroke="#5A5A5A" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="22" y1="61" x2="78" y2="61" stroke="#6A6A6A" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="28" y1="49" x2="72" y2="49" stroke="#7A7A7A" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="34" y1="37" x2="66" y2="37" stroke="#8A8A8A" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="40" y1="25" x2="60" y2="25" stroke="#9A9A9A" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="46" y1="13" x2="54" y2="13" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round"/>
        </svg>
      </div>
    );
  }

  // Primary variant
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
      {/* Data bars forming implied delta */}
      <line x1="10" y1="85" x2="90" y2="85" stroke="#4A4A4A" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="16" y1="73" x2="84" y2="73" stroke="#5A5A5A" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="22" y1="61" x2="78" y2="61" stroke="#6A6A6A" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="28" y1="49" x2="72" y2="49" stroke="#7A7A7A" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="34" y1="37" x2="66" y2="37" stroke="#8A8A8A" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="40" y1="25" x2="60" y2="25" stroke="#9A9A9A" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="46" y1="13" x2="54" y2="13" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round"/>
    </svg>
  );
}
