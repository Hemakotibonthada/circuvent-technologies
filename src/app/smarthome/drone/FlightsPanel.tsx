"use client";

/**
 * The log book.
 *
 * WHY OUTCOME IS A COLUMN AND NOT A FOOTNOTE
 *
 * Most flights land. The ones that matter are the ones that did not, and a
 * table that renders every row identically buries them — a flight that ended
 * in silence looks exactly like one that ended on the pad. So `stale` gets its
 * own badge, failsafes and fence breaches are shown on the row rather than
 * only in the detail view, and the flights worth reading are the ones the eye
 * lands on first.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, ChevronRight, Download, Plane, Radio, ShieldAlert, Timer,
} from "lucide-react";
import {
  controlPlane, type Flight, type FlightEvent, type TrackPoint,
} from "@/lib/control-plane";
import {
  Badge, Button, EmptyState, ErrorState, LoadingState, SectionTitle,
  Surface, formatDateTime, formatRelative,
} from "../_kit/primitives";
import { describeFailure, isUnsupported } from "./errors";
import { NeedsDeploy } from "./NeedsDeploy";
import { ScrollableChart } from "@/components/ui/scrollable-chart";

function duration(sec: number | null): string {
  if (sec === null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

function distance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

function outcomeBadge(f: Flight) {
  if (f.outcome === "open") return <Badge tone="info">In flight</Badge>;
  /*
   * "Ended without landing" rather than "stale". The word an operator needs is
   * the one that says what happened, not the one the database uses.
   */
  if (f.outcome === "stale") return <Badge tone="critical">Ended without landing</Badge>;
  if (f.failsafe) return <Badge tone="warning">Failsafe</Badge>;
  if (f.fenceBreach) return <Badge tone="warning">Left flight area</Badge>;
  return <Badge tone="ok">Landed</Badge>;
}

export function FlightsPanel() {
  const [flights, setFlights] = useState<Flight[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    void controlPlane.flights({ limit: 100 }).then((r) => {
      if (r.ok) {
        setFlights(r.data.flights ?? []);
        setError(null);
        setUnsupported(false);
      } else if (isUnsupported(r)) {
        setUnsupported(true);
        setFlights([]);
      } else {
        setError(describeFailure(r, "the flight log"));
        setFlights((prev) => prev ?? []);
      }
    });
  }, []);

  useEffect(load, [load]);

  if (unsupported) return <NeedsDeploy />;
  if (error && !flights) return <ErrorState message={error} onRetry={load} />;
  if (!flights) return <LoadingState label="Loading flights" />;

  if (!flights.length) {
    return (
      <EmptyState
        icon={Plane}
        title="No flights recorded"
        body="A flight is recorded from the moment the aircraft arms until it disarms. Nothing here yet."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle>
          {flights.length} flight{flights.length === 1 ? "" : "s"}
        </SectionTitle>
        {/*
          * The CSV is produced by the API, not assembled here, so the file a
          * pilot attaches to an insurance claim is byte-for-byte the one
          * support would generate.
          */}
        <a href={controlPlane.flightsCsvUrl()} target="_blank" rel="noreferrer">
          <Button icon={Download}>Export log book</Button>
        </a>
      </div>

      <div className="space-y-2">
        {flights.map((f) => (
          <FlightRow
            key={f.id}
            flight={f}
            expanded={open === f.id}
            onToggle={() => setOpen(open === f.id ? null : f.id)}
          />
        ))}
      </div>
    </div>
  );
}

function FlightRow({
  flight, expanded, onToggle,
}: { flight: Flight; expanded: boolean; onToggle: () => void }) {
  const [detail, setDetail] = useState<{ events: FlightEvent[]; points: TrackPoint[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!expanded || detail || loading) return;
    setLoading(true);
    void (async () => {
      const [d, t] = await Promise.all([
        controlPlane.flight(flight.id),
        controlPlane.flightTrack(flight.id, 600),
      ]);
      setDetail({
        events: d.ok ? d.data.events ?? [] : [],
        points: t.ok ? t.data.points ?? [] : [],
      });
      setLoading(false);
    })();
  }, [expanded, detail, loading, flight.id]);

  return (
    <Surface>
      <button onClick={onToggle} className="flex w-full items-center gap-3 text-left">
        <ChevronRight
          className="h-4 w-4 shrink-0 transition-transform"
          style={{ transform: expanded ? "rotate(90deg)" : "none" }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{formatDateTime(flight.startedAt)}</span>
            {outcomeBadge(flight)}
          </div>
          <div className="mt-1 text-xs opacity-70">
            {flight.deviceId} · airborne {duration(flight.airborneSec)} ·{" "}
            {distance(flight.distanceM)} · max {flight.maxAltM.toFixed(0)} m
            {flight.battStartPct !== null && flight.battEndPct !== null && (
              <> · battery {flight.battStartPct}% → {flight.battEndPct}%</>
            )}
          </div>
        </div>
        <span className="hidden shrink-0 text-xs opacity-60 sm:inline">
          {formatRelative(flight.startedAt)}
        </span>
      </button>

      {expanded && (
        <div className="mt-4 space-y-4 pt-4" style={{ borderTop: "1px solid var(--cv-border)" }}>
          {loading && <LoadingState label="Loading flight" />}

          {detail && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Armed for" value={duration(flight.durationSec)} icon={Timer} />
                <Stat label="Airborne" value={duration(flight.airborneSec)} icon={Plane} />
                <Stat label="Furthest from home" value={distance(flight.maxDistM)} icon={Radio} />
                <Stat
                  label="Top speed"
                  value={`${flight.maxSpeedMs.toFixed(1)} m/s`}
                  icon={AlertTriangle}
                />
              </div>

              {detail.points.length > 0 && <AltitudeProfile points={detail.points} />}

              {detail.events.length > 0 && (
                <div>
                  <SectionTitle>Events</SectionTitle>
                  <div className="mt-2 space-y-1">
                    {detail.events.map((e, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className="w-16 shrink-0 opacity-60">
                          {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                        {e.severity !== "info" && (
                          <ShieldAlert
                            className="mt-0.5 h-3 w-3 shrink-0"
                            style={{ color: e.severity === "alert" ? "#dc2626" : "#b45309" }}
                          />
                        )}
                        <span className={e.severity === "info" ? "opacity-80" : ""}>
                          {eventLabel(e)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {flight.samples === 0 && (
                <p className="text-xs opacity-60">
                  No position samples were recorded for this flight. The aircraft armed but either
                  never got a GPS fix or never reported one.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </Surface>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Plane }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "var(--cv-surface-2)" }}>
      <div className="flex items-center gap-1.5 text-xs opacity-60">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}

function eventLabel(e: FlightEvent): string {
  const d = e.detail ?? {};
  switch (e.kind) {
    case "armed": return "Armed";
    case "takeoff": return `Took off${d.alt ? ` — ${Number(d.alt).toFixed(1)} m` : ""}`;
    case "landed": return "Landed and disarmed";
    case "failsafe": return `Autopilot failsafe${d.mode ? ` — ${String(d.mode)}` : ""}`;
    case "fence-breach": return `Left the flight area${d.dist ? ` — ${Math.round(Number(d.dist))} m out` : ""}`;
    case "low-battery": return `Battery low — ${d.battPct ?? "?"}%`;
    case "telemetry-gap": return `Telemetry gap — ${d.missedBatches ?? "?"} batches missed`;
    case "flight-stale": return "Flight ended without a landing being reported";
    case "command": return `Command: ${String(d.action ?? "?")}${d.force ? " (forced)" : ""}`;
    case "command-refused": return `Refused: ${String(d.action ?? "?")} — ${String(d.reason ?? "")}`;
    default: return e.kind;
  }
}

/**
 * Altitude over the flight, as an inline SVG.
 *
 * A sparkline rather than a map, because the question this answers — "did it
 * climb, cruise and descend, or did it stop being at an altitude" — is the one
 * a shape can answer at a glance and a map cannot. Drawn from the thinned
 * track the API returns, which samples evenly across the whole flight rather
 * than truncating: the end of a flight is the half that matters.
 */
function AltitudeProfile({ points }: { points: TrackPoint[] }) {
  if (points.length < 2) return null;
  const W = 600;
  const H = 90;
  const maxAlt = Math.max(...points.map((p) => p.alt), 1);
  const t0 = new Date(points[0]!.at).getTime();
  const span = Math.max(new Date(points[points.length - 1]!.at).getTime() - t0, 1);

  const d = points
    .map((p, i) => {
      const x = ((new Date(p.at).getTime() - t0) / span) * W;
      const y = H - (p.alt / maxAlt) * (H - 6) - 3;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div>
      <SectionTitle>Altitude</SectionTitle>
      <div className="mt-2 rounded-xl p-2" style={{ background: "var(--cv-surface-2)" }}>
        {/* Up to 600 track points can come back for one flight; at a fixed
            width that is a flat smear with all the climb/descent detail in a
            handful of pixels, so it gets the same scrolling room as every
            other dense series. */}
        <ScrollableChart pointCount={points.length} minPxPerPoint={5}>
          <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" preserveAspectRatio="none">
            <path d={`${d} L${W},${H} L0,${H} Z`} fill="var(--cv-accent-dim)" />
            <path d={d} fill="none" stroke="var(--cv-accent-hi)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
        </ScrollableChart>
        <div className="flex justify-between px-1 text-[10px] opacity-60">
          <span>0 m</span>
          <span>peak {maxAlt.toFixed(0)} m</span>
        </div>
      </div>
    </div>
  );
}
