"use client";

import { useMemo, useState } from "react";
import type { FleetDevice, Health } from "../_lib/sim";

const HEALTH_COLOR: Record<Health, string> = {
  healthy: "#22c55e", warning: "#f59e0b", critical: "#ef4444", offline: "#64748b",
};

const W = 1000;
const H = 480;
const proj = (lat: number, lng: number) => ({ x: ((lng + 180) / 360) * W, y: ((90 - lat) / 180) * H });

export default function FleetMap({
  devices, onSelectRegion, selectedRegion, height = 420,
}: {
  devices: FleetDevice[];
  onSelectRegion?: (region: string | null) => void;
  selectedRegion?: string | null;
  height?: number;
}) {
  const [hover, setHover] = useState<{ x: number; y: number; d: FleetDevice } | null>(null);

  const clusters = useMemo(() => {
    const byRegion = new Map<string, { lat: number; lng: number; devices: FleetDevice[] }>();
    for (const d of devices) {
      const c = byRegion.get(d.region) ?? { lat: 0, lng: 0, devices: [] };
      c.lat += d.lat; c.lng += d.lng; c.devices.push(d);
      byRegion.set(d.region, c);
    }
    return Array.from(byRegion.entries()).map(([region, c]) => ({
      region,
      lat: c.lat / c.devices.length,
      lng: c.lng / c.devices.length,
      count: c.devices.length,
      critical: c.devices.filter((d) => d.health === "critical" || !d.online).length,
    }));
  }, [devices]);

  const graticule: React.ReactNode[] = [];
  for (let lng = -150; lng <= 150; lng += 30) {
    const { x } = proj(0, lng);
    graticule.push(<line key={`v${lng}`} x1={x} y1={0} x2={x} y2={H} stroke="rgba(148,163,184,.07)" strokeWidth={1} />);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const { y } = proj(lat, 0);
    graticule.push(<line key={`h${lat}`} x1={0} y1={y} x2={W} y2={y} stroke="rgba(148,163,184,.07)" strokeWidth={1} />);
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height }} className="rounded-xl">
        <defs>
          <radialGradient id="mapglow" cx="50%" cy="0%" r="80%">
            <stop offset="0%" stopColor="rgba(6,182,212,.10)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>
        <rect x={0} y={0} width={W} height={H} fill="url(#mapglow)" />
        {graticule}

        {/* individual devices */}
        {devices.map((d, i) => {
          const { x, y } = proj(d.lat, d.lng);
          const dim = selectedRegion && d.region !== selectedRegion;
          return (
            <circle
              key={d.id + i} cx={x} cy={y} r={3}
              fill={HEALTH_COLOR[d.health]} opacity={dim ? 0.15 : 0.85}
              onMouseEnter={() => setHover({ x, y, d })} onMouseLeave={() => setHover(null)}
              style={{ cursor: "pointer" }}
            />
          );
        })}

        {/* region clusters */}
        {clusters.map((c) => {
          const { x, y } = proj(c.lat, c.lng);
          const r = 14 + Math.min(26, c.count / 4);
          const selected = selectedRegion === c.region;
          return (
            <g key={c.region} onClick={() => onSelectRegion?.(selected ? null : c.region)} style={{ cursor: "pointer" }}>
              <circle cx={x} cy={y} r={r} fill="rgba(6,182,212,.10)" stroke={selected ? "#22d3ee" : "rgba(6,182,212,.5)"} strokeWidth={selected ? 2 : 1} />
              <circle cx={x} cy={y} r={r} fill="none" stroke="rgba(6,182,212,.25)" strokeWidth={1}>
                <animate attributeName="r" from={r} to={r + 12} dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.5" to="0" dur="2.4s" repeatCount="indefinite" />
              </circle>
              <text x={x} y={y + 4} textAnchor="middle" fontSize={13} fontWeight={700} fill="#e2e8f0">{c.count}</text>
              <text x={x} y={y + r + 14} textAnchor="middle" fontSize={10} fill="#7c8aa5">{c.region}</text>
            </g>
          );
        })}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-white/10 bg-black/85 px-2.5 py-1.5 text-xs text-white backdrop-blur"
          style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * height}px`, transform: "translate(-50%, -130%)" }}
        >
          <div className="font-semibold">{hover.d.name}</div>
          <div className="text-slate-400">{hover.d.city} · {hover.d.health}</div>
        </div>
      )}

      {/* legend */}
      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs ad-muted">
        {(Object.keys(HEALTH_COLOR) as Health[]).map((h) => (
          <span key={h} className="flex items-center gap-1.5 capitalize">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: HEALTH_COLOR[h] }} /> {h}
          </span>
        ))}
        <span className="ml-auto">{devices.length} devices · click a cluster to filter by region</span>
      </div>
    </div>
  );
}
