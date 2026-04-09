// DonutChart component

interface ChartDataItem {
  name: string;
  value: number;
}

interface DonutChartProps {
  data: ChartDataItem[];
  size?: number;
  innerRadius?: number;
}

export default function DonutChart({ data, size = 250, innerRadius = 60 }: DonutChartProps) {
  if (!data || data.length === 0) return null;

  const total = data.reduce((sum, item) => sum + item.value, 0);
  let currentAngle = 0;

  // 간단한 색상 팔레트
  const colors = ['#dc2626', '#ea580c', '#eab308', '#16a34a', '#2563eb'];

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`translate(${size / 2}, ${size / 2})`}>
          {data.map((item, index) => {
            const angle = (item.value / total) * 360;
            const startAngle = currentAngle;
            currentAngle += angle;

            // 라디안 변환
            const startRad = (startAngle - 90) * (Math.PI / 180);
            const endRad = (currentAngle - 90) * (Math.PI / 180);

            const r = size / 2;
            const x1 = Math.cos(startRad) * r;
            const y1 = Math.sin(startRad) * r;
            const x2 = Math.cos(endRad) * r;
            const y2 = Math.sin(endRad) * r;

            const largeArcFlag = angle > 180 ? 1 : 0;

            const d = [
              `M 0 0`,
              `L ${x1} ${y1}`,
              `A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
              `Z`
            ].join(' ');

            return (
              <path
                key={item.name}
                d={d}
                fill={colors[index % colors.length]}
              >
                <title>{`${item.name} (${item.value})`}</title>
              </path>
            );
          })}
          {/* 중앙 파내기 (도넛) */}
          <circle cx="0" cy="0" r={innerRadius} fill="var(--bg-surface-variant, #fff)" className="dark:fill-gray-900" />
        </g>
      </svg>
      <div className="mt-4 flex flex-wrap gap-3 justify-center text-xs">
        {data.map((item, i) => (
          <div key={item.name} className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[i % colors.length] }} />
            <span>{item.name} ({item.value})</span>
          </div>
        ))}
      </div>
    </div>
  );
}
