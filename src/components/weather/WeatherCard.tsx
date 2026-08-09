"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, MapPin, RefreshCw, Loader2, X, Wind, Droplets, Sun, Gauge, Eye } from "lucide-react";
import { wmo, aqiCategory, weatherTips, type WeatherBundle, type GeoPlace } from "@/lib/weather";

const LS_KEY = "cv-weather-loc";

function fmtHour(t: string) { return new Date(t).toLocaleTimeString([], { hour: "numeric" }); }
function fmtDay(t: string, i: number) { return i === 0 ? "Today" : new Date(t).toLocaleDateString([], { weekday: "short" }); }
function fmtClock(t: string) { return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

export default function WeatherCard({ defaultQuery = "Bengaluru", className = "" }: { defaultQuery?: string; className?: string }) {
  const [bundle, setBundle] = useState<WeatherBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [q, setQ] = useState("");
  const [places, setPlaces] = useState<GeoPlace[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadByCoords = useCallback(async (lat: number, lon: number, name?: string) => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/weather?lat=${lat}&lon=${lon}${name ? `&name=${encodeURIComponent(name)}` : ""}`);
      const d = await r.json();
      if (d.ok) { setBundle(d.bundle); try { localStorage.setItem(LS_KEY, JSON.stringify({ lat, lon, name: name || d.bundle.place.name })); } catch { /* ignore */ } }
      else setError(d.error || "Failed to load weather");
    } catch { setError("Network error"); }
    setLoading(false);
  }, []);

  const loadByQuery = useCallback(async (query: string) => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/weather?q=${encodeURIComponent(query)}`);
      const d = await r.json();
      if (d.ok) { setBundle(d.bundle); const p = d.bundle.place; try { localStorage.setItem(LS_KEY, JSON.stringify({ lat: p.latitude, lon: p.longitude, name: p.name })); } catch { /* ignore */ } }
      else setError(d.error || "City not found");
    } catch { setError("Network error"); }
    setLoading(false);
  }, []);

  useEffect(() => {
    let saved: { lat: number; lon: number; name?: string } | null = null;
    try { const s = localStorage.getItem(LS_KEY); if (s) saved = JSON.parse(s); } catch { /* ignore */ }
    if (saved) loadByCoords(saved.lat, saved.lon, saved.name);
    else loadByQuery(defaultQuery);
  }, [defaultQuery, loadByCoords, loadByQuery]);

  const useMyLocation = () => {
    if (!navigator.geolocation) { setError("Geolocation not available"); return; }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => loadByCoords(pos.coords.latitude, pos.coords.longitude, "My location"),
      () => { setLoading(false); setError("Location permission denied"); },
      { timeout: 8000 }
    );
  };

  useEffect(() => {
    if (!q.trim()) { setPlaces([]); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try { const r = await fetch(`/api/weather?search=${encodeURIComponent(q)}`); const d = await r.json(); if (d.ok) setPlaces(d.places || []); } catch { /* ignore */ }
    }, 300);
  }, [q]);

  const pick = (p: GeoPlace) => {
    setShowSearch(false); setQ(""); setPlaces([]);
    loadByCoords(p.latitude, p.longitude, [p.name, p.admin1, p.country].filter(Boolean).join(", "));
  };

  const card: React.CSSProperties = { background: "var(--bg-surface, #0f1629)", border: "1px solid var(--border-primary, rgba(255,255,255,0.1))" };
  const T = "var(--text-primary, #f8fafc)"; const T2 = "var(--text-secondary, #cbd5e1)"; const T3 = "var(--text-tertiary, #94a3b8)";

  const cur = bundle?.current;
  const w = cur ? wmo(cur.weatherCode) : null;
  const aqi = bundle?.air ? aqiCategory(bundle.air.usAqi) : null;
  const tips = bundle ? weatherTips(bundle) : [];
  const tMaxs = bundle ? bundle.daily.map((d) => d.tMax) : [];
  const tMins = bundle ? bundle.daily.map((d) => d.tMin) : [];
  const weekMax = Math.max(1, ...tMaxs); const weekMin = Math.min(0, ...tMins); const span = weekMax - weekMin || 1;

  return (
    <div className={`rounded-3xl p-5 ${className}`} style={card}>
      {/* header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="h-4 w-4 shrink-0" style={{ color: "var(--accent-cyan, #06b6d4)" }} />
          <span className="truncate text-sm font-semibold" style={{ color: T }}>{bundle?.place.name ?? "Weather"}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={useMyLocation} title="Use my location" className="rounded-lg inline-flex h-[44px] w-[44px] items-center justify-center hover:bg-white/5"><MapPin className="h-4 w-4" style={{ color: T3 }} /></button>
          <button onClick={() => setShowSearch((s) => !s)} title="Search city" className="rounded-lg inline-flex h-[44px] w-[44px] items-center justify-center hover:bg-white/5"><Search className="h-4 w-4" style={{ color: T3 }} /></button>
          <button onClick={() => bundle && loadByCoords(bundle.place.latitude, bundle.place.longitude, bundle.place.name)} title="Refresh" className="rounded-lg inline-flex h-[44px] w-[44px] items-center justify-center hover:bg-white/5"><RefreshCw className="h-4 w-4" style={{ color: T3 }} /></button>
        </div>
      </div>

      {showSearch && (
        <div className="relative mt-3">
          <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "var(--bg-glass, rgba(255,255,255,0.05))", border: "1px solid var(--border-primary, rgba(255,255,255,0.1))" }}>
            <Search className="h-4 w-4" style={{ color: T3 }} />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search city…" className="w-full bg-transparent text-sm outline-none" style={{ color: T }} />
            {q && <button onClick={() => setQ("")}><X className="h-4 w-4" style={{ color: T3 }} /></button>}
          </div>
          {places.length > 0 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl" style={{ ...card, background: "var(--bg-surface, #0f1629)" }}>
              {places.map((p) => (
                <button key={p.id} onClick={() => pick(p)} className="block w-full px-3 py-2 text-left text-sm hover:bg-white/5" style={{ color: T2 }}>
                  {p.name}<span style={{ color: T3 }}>{[p.admin1, p.country].filter(Boolean).length ? ` · ${[p.admin1, p.country].filter(Boolean).join(", ")}` : ""}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading && !bundle ? (
        <div className="flex items-center justify-center py-14"><Loader2 className="h-6 w-6 animate-spin" style={{ color: T3 }} /></div>
      ) : error && !bundle ? (
        <div className="py-10 text-center text-sm" style={{ color: "#ef4444" }}>{error}</div>
      ) : bundle && cur && w ? (
        <>
          {/* current */}
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-5xl leading-none">{w.icon}</span>
              <div>
                <div className="text-4xl font-extrabold leading-none" style={{ color: T }}>{Math.round(cur.temperature)}°</div>
                <div className="text-sm" style={{ color: T2 }}>{w.label}</div>
              </div>
            </div>
            <div className="text-right text-sm" style={{ color: T3 }}>
              <div>Feels {Math.round(cur.apparent)}°</div>
              {bundle.daily[0] && <div>H {Math.round(bundle.daily[0].tMax)}° · L {Math.round(bundle.daily[0].tMin)}°</div>}
            </div>
          </div>

          {/* stat chips */}
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
            <Stat icon={<Droplets className="h-4 w-4" />} label="Humidity" value={`${Math.round(cur.humidity)}%`} T={T} T3={T3} />
            <Stat icon={<Wind className="h-4 w-4" />} label="Wind" value={`${Math.round(cur.windSpeed)} km/h`} T={T} T3={T3} />
            <Stat icon={<Sun className="h-4 w-4" />} label="UV max" value={`${Math.round(bundle.daily[0]?.uvIndexMax ?? 0)}`} T={T} T3={T3} />
            {aqi && <Stat icon={<Eye className="h-4 w-4" />} label="AQI" value={bundle.air?.usAqi != null ? String(Math.round(bundle.air.usAqi)) : "—"} valueColor={aqi.textColor} T={T} T3={T3} />}
            {cur.pressure != null && <Stat icon={<Gauge className="h-4 w-4" />} label="Pressure" value={`${Math.round(cur.pressure)}`} T={T} T3={T3} />}
          </div>
          {bundle.daily[0] && (
            <div className="mt-2 text-xs" style={{ color: T3 }}>☀️ {fmtClock(bundle.daily[0].sunrise)} · 🌙 {fmtClock(bundle.daily[0].sunset)}{aqi ? ` · Air: ${aqi.label}` : ""}</div>
          )}

          {/* hourly */}
          <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
            {bundle.hourly.slice(0, 12).map((h, i) => {
              const hw = wmo(h.weatherCode);
              return (
                <div key={h.time} className="flex shrink-0 flex-col items-center gap-1 rounded-xl px-3 py-2" style={{ background: "var(--bg-glass, rgba(255,255,255,0.04))" }}>
                  <span className="text-xs" style={{ color: T3 }}>{i === 0 ? "Now" : fmtHour(h.time)}</span>
                  <span className="text-lg">{hw.icon}</span>
                  <span className="text-sm font-semibold" style={{ color: T }}>{Math.round(h.temperature)}°</span>
                  <span className="text-[10px]" style={{ color: "var(--accent-cyan-text, #155e75)" }}>{Math.round(h.precipitationProb)}%</span>
                </div>
              );
            })}
          </div>

          {/* 7-day */}
          <div className="mt-4 space-y-1">
            {bundle.daily.map((d, i) => {
              const dw = wmo(d.weatherCode);
              const left = ((d.tMin - weekMin) / span) * 100;
              const width = ((d.tMax - d.tMin) / span) * 100;
              return (
                <div key={d.date} className="flex items-center gap-3 text-sm">
                  <span className="w-12 shrink-0" style={{ color: T2 }}>{fmtDay(d.date, i)}</span>
                  <span className="w-6 text-center">{dw.icon}</span>
                  <span className="w-8 shrink-0 text-right text-xs" style={{ color: "var(--accent-cyan-text, #155e75)" }}>{Math.round(d.precipProbMax)}%</span>
                  <span className="w-7 shrink-0 text-right" style={{ color: T3 }}>{Math.round(d.tMin)}°</span>
                  <div className="relative h-1.5 flex-1 rounded-full" style={{ background: "var(--bg-glass, rgba(255,255,255,0.08))" }}>
                    <div className="absolute h-1.5 rounded-full" style={{ left: `${left}%`, width: `${Math.max(6, width)}%`, background: "linear-gradient(90deg,#22d3ee,#f59e0b)" }} />
                  </div>
                  <span className="w-7 shrink-0" style={{ color: T }}>{Math.round(d.tMax)}°</span>
                </div>
              );
            })}
          </div>

          {/* smart-home tips */}
          {tips.length > 0 && (
            <div className="mt-4 space-y-2">
              {tips.slice(0, 3).map((t) => (
                <div key={t.id} className="flex items-start gap-2 rounded-xl px-3 py-2" style={{ background: "var(--bg-glass, rgba(255,255,255,0.04))" }}>
                  <span className="text-base">{t.icon}</span>
                  <div><div className="text-xs font-semibold" style={{ color: T }}>{t.title}</div><div className="text-xs" style={{ color: T3 }}>{t.body}</div></div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 text-[10px]" style={{ color: T3 }}>Updated {new Date(bundle.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · Open-Meteo</div>
        </>
      ) : null}
    </div>
  );
}

function Stat({ icon, label, value, valueColor, T, T3 }: { icon: React.ReactNode; label: string; value: string; valueColor?: string; T: string; T3: string }) {
  return (
    <div className="rounded-xl px-2 py-2 text-center" style={{ background: "var(--bg-glass, rgba(255,255,255,0.04))" }}>
      <div className="flex justify-center" style={{ color: T3 }}>{icon}</div>
      <div className="mt-1 text-sm font-bold" style={{ color: valueColor || T }}>{value}</div>
      <div className="text-[10px]" style={{ color: T3 }}>{label}</div>
    </div>
  );
}
