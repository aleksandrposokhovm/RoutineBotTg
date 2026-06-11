
interface KBJUChartProps {
  eaten: { calories: number; protein: number; fat: number; carbs: number };
  goals: { dailyCalories: number; dailyProtein: number; dailyFat: number; dailyCarbs: number } | null;
}

function CircleProgress({
  value,
  max,
  color,
  size = 100,
  strokeWidth = 8,
  label,
}: {
  value: number;
  max: number;
  color: string;
  size?: number;
  strokeWidth?: number;
  label: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = max > 0 ? Math.min(value / max, 1) : 0;
  const offset = circumference * (1 - progress);

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--bg-secondary)"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
          {Math.round(value)}
        </span>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{label}</span>
      </div>
    </div>
  );
}

export function KBJUChart({ eaten, goals }: KBJUChartProps) {
  const remaining = goals
    ? {
        calories: Math.max(0, goals.dailyCalories - eaten.calories),
        protein: Math.max(0, goals.dailyProtein - eaten.protein),
        fat: Math.max(0, goals.dailyFat - eaten.fat),
        carbs: Math.max(0, goals.dailyCarbs - eaten.carbs),
      }
    : null;

  return (
    <div className="kbju-chart animate-fade-in">
      <div className="kbju-chart-title">КБЖУ за день</div>

      {/* Main calorie ring */}
      <div className="kbju-ring-container">
        <CircleProgress
          value={eaten.calories}
          max={goals?.dailyCalories || 2000}
          color="var(--color-accent)"
          size={120}
          strokeWidth={10}
          label="ккал"
        />
      </div>

      {/* Macro stats */}
      <div className="kbju-stats">
        <div className="kbju-stat">
          <div className="kbju-stat-value" style={{ color: 'var(--color-accent)' }}>
            {Math.round(eaten.calories)}
          </div>
          <div className="kbju-stat-label">Калории</div>
          {remaining && (
            <div className="kbju-stat-remaining">ост. {Math.round(remaining.calories)}</div>
          )}
        </div>
        <div className="kbju-stat">
          <div className="kbju-stat-value" style={{ color: 'var(--color-info)' }}>
            {Math.round(eaten.protein)}г
          </div>
          <div className="kbju-stat-label">Белки</div>
          {remaining && (
            <div className="kbju-stat-remaining">ост. {Math.round(remaining.protein)}г</div>
          )}
        </div>
        <div className="kbju-stat">
          <div className="kbju-stat-value" style={{ color: 'var(--color-warning)' }}>
            {Math.round(eaten.fat)}г
          </div>
          <div className="kbju-stat-label">Жиры</div>
          {remaining && (
            <div className="kbju-stat-remaining">ост. {Math.round(remaining.fat)}г</div>
          )}
        </div>
        <div className="kbju-stat">
          <div className="kbju-stat-value" style={{ color: 'var(--color-success)' }}>
            {Math.round(eaten.carbs)}г
          </div>
          <div className="kbju-stat-label">Углеводы</div>
          {remaining && (
            <div className="kbju-stat-remaining">ост. {Math.round(remaining.carbs)}г</div>
          )}
        </div>
      </div>
    </div>
  );
}
