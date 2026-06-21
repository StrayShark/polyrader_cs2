import { useState, useEffect, useRef } from 'react';

type FlashDirection = 'up' | 'down' | null;

/**
 * usePriceFlash — tracks price changes and returns flash direction + animation state.
 * Returns the current value and a CSS color based on recent price movement.
 */
export function usePriceFlash(value: number, duration = 800): {
  flashDirection: FlashDirection;
  flashColor: string;
} {
  const [flashDirection, setFlashDirection] = useState<FlashDirection>(null);
  const prevValueRef = useRef(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const prev = prevValueRef.current;
    if (value !== prev) {
      setFlashDirection(value > prev ? 'up' : 'down');
      prevValueRef.current = value;

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setFlashDirection(null);
      }, duration);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [value, duration]);

  const flashColor =
    flashDirection === 'up' ? 'var(--green)' :
    flashDirection === 'down' ? 'var(--red)' :
    'var(--foreground)';

  return { flashDirection, flashColor };
}

interface PriceFlashProps {
  value: number;
  format?: (v: number) => string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * PriceFlash — displays a value that flashes green/red on price changes.
 */
export function PriceFlash({ value, format, className, style }: PriceFlashProps) {
  const { flashColor, flashDirection } = usePriceFlash(value);
  const display = format ? format(value) : String(value);

  return (
    <span
      className={className}
      style={{
        color: flashColor,
        transition: 'color 0.15s ease',
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        textShadow: flashDirection ? `0 0 8px ${flashColor === 'var(--green)' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}` : 'none',
        ...style,
      }}
    >
      {flashDirection === 'up' && '▲ '}
      {flashDirection === 'down' && '▼ '}
      {display}
    </span>
  );
}
