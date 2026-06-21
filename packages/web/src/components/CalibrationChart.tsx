import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';
import { useI18n } from '../hooks/use-i18n';

interface CalibrationPoint {
  confidenceBucket: number;
  accuracy: number;
  sampleCount: number;
}

interface CalibrationChartProps {
  data: CalibrationPoint[];
  providerName?: string;
}

export function CalibrationChart({ data, providerName }: CalibrationChartProps) {
  const { t } = useI18n();
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        {t('calibration.empty')}
      </div>
    );
  }

  const chartData = data.map((d) => ({
    confidence: `${d.confidenceBucket * 10}%`,
    accuracy: Math.round(d.accuracy * 100),
    samples: d.sampleCount,
  }));

  return (
    <div className="w-full">
      {providerName && (
        <div className="mb-2 text-xs text-muted-foreground capitalize">{t('calibration.curve', { provider: providerName })}</div>
      )}
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="confidence"
            tick={{ fontSize: 10, fill: '#A1A1AA' }}
            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: '#A1A1AA' }}
            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            contentStyle={{
              background: '#18181B',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              fontSize: '12px',
            }}
            labelStyle={{ color: '#A1A1AA' }}
            formatter={(value: number, name: string) => {
              if (name === 'accuracy') return [`${value}%`, t('calibration.actualAccuracy')];
              if (name === 'samples') return [value, t('calibration.sampleCount')];
              return [value, name];
            }}
          />
          <ReferenceLine
            y={50}
            stroke="rgba(255,255,255,0.1)"
            strokeDasharray="3 3"
          />
          {/* Perfect calibration line */}
          <Line
            type="monotone"
            dataKey={(d: { confidence: string }) => parseInt(d.confidence)}
            stroke="rgba(255,255,255,0.1)"
            strokeDasharray="5 5"
            dot={false}
            name={t('calibration.perfect')}
          />
          <Line
            type="monotone"
            dataKey="accuracy"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={{ r: 4, fill: '#3B82F6' }}
            name={t('calibration.actualAccuracy')}
          />
          <Legend
            wrapperStyle={{ fontSize: '11px', color: '#A1A1AA' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
