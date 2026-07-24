"use client";

function niceMax(v: number) {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

export function Sparkline({ data, color = "var(--cv-accent)", width = 100, height = 34 }: { data: number[]; color?: string; width?: number; height?: number }) {
  if (!data.length) return <div style={{ width, height }} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1 || 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`).join(" ");
  return (
    <svg width={width} height={height} role="img" aria-label="trend">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function LineChart({ data, color = "var(--cv-accent)", height = 180 }: { data: number[]; color?: string; height?: number }) {
  const W = 360;
  const H = height;
  const padB = 24;
  const padT = 10;
  if (!data.length) return <Empty height={height} />;
  const max = niceMax(Math.max(...data, 1));
  const stepX = W / (data.length - 1 || 1);
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const line = data.map((v, i) => `${i * stepX},${y(v)}`).join(" ");
  const area = `0,${H - padB} ${line} ${W},${H - padB}`;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="energy history">
      <defs>
        <linearGradient id="cv-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".35" />
          <stop offset="1" stopColor={color} stopOpacity=".02" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((f) => (
        <line key={f} x1="0" x2={W} y1={padT + f * (H - padT - padB)} y2={padT + f * (H - padT - padB)} stroke="var(--cv-border)" />
      ))}
      <polygon points={area} fill="url(#cv-area)" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Gauge({ value, max = 3000, label = "Live power", unit = "W", color = "var(--cv-accent)", size = 170 }: { value: number; max?: number; label?: string; unit?: string; color?: string; size?: number }) {
  const r = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2;
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const arc = (a0: number, a1: number) => {
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
  };
  return (
    <div className="relative flex flex-col items-center">
      <svg width={size} height={size / 2 + 18}>
        <path d={arc(Math.PI, 2 * Math.PI)} stroke="var(--cv-border)" strokeWidth="12" fill="none" strokeLinecap="round" />
        <path d={arc(Math.PI, Math.PI + Math.PI * pct)} stroke={color} strokeWidth="12" fill="none" strokeLinecap="round" />
      </svg>
      <div className="absolute top-10 text-center">
        <div className="text-3xl font-extrabold text-white">{Math.round(value)}<span className="text-sm text-slate-400">{unit}</span></div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}

export function Donut({ segments, size = 150 }: { segments: { label: string; value: number; color: string }[]; size?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2;
  let acc = -Math.PI / 2;
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} role="img" aria-label="consumption split">
        {segments.map((seg) => {
          const frac = seg.value / total;
          const a0 = acc;
          const a1 = acc + frac * 2 * Math.PI;
          acc = a1;
          const x0 = cx + r * Math.cos(a0);
          const y0 = cy + r * Math.sin(a0);
          const x1 = cx + r * Math.cos(a1);
          const y1 = cy + r * Math.sin(a1);
          return <path key={seg.label} d={`M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`} stroke={seg.color} strokeWidth="16" fill="none" />;
        })}
      </svg>
      <div className="space-y-2">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded" style={{ background: seg.color }} />
            <span className="text-slate-300">{seg.label}</span>
            <span className="font-bold text-white">{Math.round((seg.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty({ height }: { height: number }) {
  return <div className="flex items-center justify-center text-sm text-slate-500" style={{ height }}>No data yet — collecting…</div>;
}
