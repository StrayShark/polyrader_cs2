interface FactorData {
  label: string;
  value: number; // 0-1
  color: string;
}

interface FactorRingProps {
  factors: FactorData[];
  size?: number;
}

/**
 * FactorRing — radial chart showing up to 6 analysis factors as segments.
 * Each factor is rendered as an arc with varying length and color.
 */
export function FactorRing({ factors, size = 160 }: FactorRingProps) {
  const center = size / 2;
  const radius = size / 2 - 20;
  const innerRadius = radius - 16;
  const gap = 0.04; // gap between segments in radians
  const segmentAngle = (Math.PI * 2) / Math.max(factors.length, 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background ring */}
        <circle
          cx={center}
          cy={center}
          r={radius - 8}
          fill="none"
          stroke="var(--muted)"
          strokeWidth="1"
          opacity="0.3"
        />

        {/* Factor segments */}
        {factors.map((factor, i) => {
          const startAngle = i * segmentAngle + gap - Math.PI / 2;
          const endAngle = startAngle + segmentAngle * factor.value - gap;
          const arcPath = describeArc(center, center, radius, innerRadius, startAngle, endAngle);

          return (
            <path
              key={i}
              d={arcPath}
              fill={factor.color}
              opacity="0.85"
              style={{ transition: 'all 0.3s ease' }}
            />
          );
        })}

        {/* Center text */}
        <text
          x={center}
          y={center - 4}
          textAnchor="middle"
          fill="var(--foreground)"
          fontSize="20"
          fontWeight="700"
          fontFamily="var(--font-mono)"
        >
          {Math.round(factors.reduce((sum, f) => sum + f.value, 0) / factors.length * 100)}%
        </text>
        <text
          x={center}
          y={center + 12}
          textAnchor="middle"
          fill="var(--muted-foreground)"
          fontSize="9"
        >
          Avg Score
        </text>
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', justifyContent: 'center', maxWidth: '200px' }}>
        {factors.map((factor, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '2px',
              background: factor.color,
              flexShrink: 0,
            }} />
            <span style={{ color: 'var(--muted-foreground)' }}>{factor.label}</span>
            <span style={{ color: 'var(--foreground)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
              {(factor.value * 100).toFixed(0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function describeArc(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number,
): string {
  const startOuter = polarToCartesian(cx, cy, outerR, endAngle);
  const endOuter = polarToCartesian(cx, cy, outerR, startAngle);
  const startInner = polarToCartesian(cx, cy, innerR, startAngle);
  const endInner = polarToCartesian(cx, cy, innerR, endAngle);
  const largeArc = endAngle - startAngle <= Math.PI ? '0' : '1';

  return [
    'M', startOuter.x, startOuter.y,
    'A', outerR, outerR, 0, largeArc, 0, endOuter.x, endOuter.y,
    'L', startInner.x, startInner.y,
    'A', innerR, innerR, 0, largeArc, 1, endInner.x, endInner.y,
    'Z',
  ].join(' ');
}

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}
