interface LLMConsensus {
  provider: string;
  model: string;
  teamAProb: number;
  confidence: number;
}

interface LLMConsensusGaugeProps {
  consensus: LLMConsensus[];
  teamAName?: string;
  teamBName?: string;
}

/**
 * LLMConsensusGauge — semi-circular gauge showing LLM consensus distribution.
 * Displays each LLM provider's prediction as a needle, with team A/B split.
 */
export function LLMConsensusGauge({ consensus, teamAName = 'Team A', teamBName = 'Team B' }: LLMConsensusGaugeProps) {
  const width = 240;
  const height = 140;
  const cx = width / 2;
  const cy = height - 20;
  const radius = 90;

  // Average team A probability across all LLMs
  const avgProbA = consensus.length > 0
    ? consensus.reduce((sum, c) => sum + c.teamAProb, 0) / consensus.length
    : 0.5;

  // Convert probability (0-1) to angle (-90deg to +90deg)
  const probToAngle = (prob: number) => {
    return Math.PI * (prob - 0.5); // -PI/2 to PI/2
  };

  const polarToCartesian = (r: number, angle: number) => ({
    x: cx + r * Math.cos(Math.PI - angle),
    y: cy - r * Math.sin(Math.PI - angle),
  });

  // Arc path for the gauge background
  const arcPath = (startAngle: number, endAngle: number, r: number) => {
    const start = polarToCartesian(r, startAngle);
    const end = polarToCartesian(r, endAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  };

  const avgAngle = probToAngle(avgProbA);

  // Colors per provider
  const providerColors: Record<string, string> = {
    openai: '#10B981',
    anthropic: '#F97316',
    google: '#3B82F6',
    deepseek: '#A855F7',
    xai: '#EAB308',
    groq: '#EF4444',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <svg width={width} height={height}>
        {/* Background arc — Team B side (red) */}
        <path
          d={arcPath(-Math.PI / 2, 0, radius)}
          fill="none"
          stroke="var(--red)"
          strokeWidth="10"
          opacity="0.15"
          strokeLinecap="round"
        />
        {/* Background arc — Team A side (green) */}
        <path
          d={arcPath(0, Math.PI / 2, radius)}
          fill="none"
          stroke="var(--green)"
          strokeWidth="10"
          opacity="0.15"
          strokeLinecap="round"
        />

        {/* Individual LLM needles */}
        {consensus.map((c, i) => {
          const angle = probToAngle(c.teamAProb);
          const tip = polarToCartesian(radius - 12, angle);
          const color = providerColors[c.provider] ?? 'var(--muted-foreground)';
          return (
            <g key={i}>
              <line
                x1={cx}
                y1={cy}
                x2={tip.x}
                y2={tip.y}
                stroke={color}
                strokeWidth="2"
                opacity="0.7"
                strokeLinecap="round"
              />
              <circle cx={tip.x} cy={tip.y} r="3" fill={color} opacity="0.9" />
            </g>
          );
        })}

        {/* Average needle (bold) */}
        <line
          x1={cx}
          y1={cy}
          x2={polarToCartesian(radius - 8, avgAngle).x}
          y2={polarToCartesian(radius - 8, avgAngle).y}
          stroke="var(--foreground)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="5" fill="var(--foreground)" />

        {/* Center label */}
        <text
          x={cx}
          y={cy - 12}
          textAnchor="middle"
          fill="var(--foreground)"
          fontSize="11"
          fontFamily="var(--font-mono)"
          fontWeight="600"
        >
          {(avgProbA * 100).toFixed(1)}%
        </text>

        {/* Team labels */}
        <text x={cx - radius + 4} y={cy + 12} textAnchor="start" fill="var(--red)" fontSize="9">
          {teamBName}
        </text>
        <text x={cx + radius - 4} y={cy + 12} textAnchor="end" fill="var(--green)" fontSize="9">
          {teamAName}
        </text>
      </svg>

      {/* LLM provider legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', justifyContent: 'center', maxWidth: '260px' }}>
        {consensus.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px' }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: providerColors[c.provider] ?? 'var(--muted-foreground)',
              flexShrink: 0,
            }} />
            <span style={{ color: 'var(--muted-foreground)' }}>{c.provider}</span>
            <span style={{ color: 'var(--foreground)', fontFamily: 'var(--font-mono)' }}>
              {(c.teamAProb * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
