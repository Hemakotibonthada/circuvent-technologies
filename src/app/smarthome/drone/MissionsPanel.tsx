"use client";

/**
 * Missions — stored waypoint routes.
 *
 * WHY MISSIONS ARE STORED HERE BUT NOT FLOWN FROM HERE
 *
 * The autopilot has to hold the mission, because it has to keep flying it when
 * this link goes away. A mission that only existed in the cloud would stop at
 * the first dropout — which, on a survey line behind a treeline, is a
 * guarantee rather than a risk.
 *
 * So this panel is a library and a planner. Flying one is a single "start"
 * command that hands the whole route to the aircraft, after which the cloud is
 * out of the loop entirely.
 */

import { useCallback, useEffect, useState } from "react";
import { MapPin, Plus, Route, Trash2 } from "lucide-react";
import { controlPlane, type Mission, type Waypoint, type DroneLimits } from "@/lib/control-plane";
import {
  Badge, Button, EmptyState, ErrorState, Field, LoadingState, NumberInput,
  SectionTitle, SelectInput, Surface, TextInput,
} from "../_kit/primitives";
import { useToast } from "../_kit/overlays";

const ACTIONS = [
  { value: "waypoint" as const, label: "Fly through" },
  { value: "loiter" as const, label: "Hold here" },
  { value: "land" as const, label: "Land here" },
  { value: "rtl" as const, label: "Return home" },
];

/** Great-circle distance, for the route length estimate. */
function haversineM(a: Waypoint, b: Waypoint): number {
  const R = 6371008.8;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const la1 = a.lat * toRad;
  const la2 = b.lat * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function routeLength(wps: Waypoint[]): number {
  let total = 0;
  for (let i = 1; i < wps.length; i++) total += haversineM(wps[i - 1]!, wps[i]!);
  return total;
}

export function MissionsPanel() {
  const toast = useToast();
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [limits, setLimits] = useState<DroneLimits | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);

  const load = useCallback(() => {
    void Promise.all([controlPlane.droneMissions(), controlPlane.droneLive()]).then(([m, live]) => {
      if (m.ok) {
        setMissions(m.data.missions ?? []);
        setError(null);
      } else {
        setError((m.data as { error?: string })?.error || "Could not load missions.");
        setMissions((prev) => prev ?? []);
      }
      if (live.ok) setLimits(live.data.limits ?? null);
    });
  }, []);

  useEffect(load, [load]);

  const addWaypoint = useCallback(() => {
    const last = waypoints[waypoints.length - 1];
    setWaypoints((w) => [
      ...w,
      { lat: last?.lat ?? 17.385, lon: last?.lon ?? 78.4867, alt: last?.alt ?? 30, action: "waypoint" },
    ]);
  }, [waypoints]);

  const patch = useCallback((i: number, p: Partial<Waypoint>) => {
    setWaypoints((w) => w.map((x, j) => (j === i ? { ...x, ...p } : x)));
  }, []);

  const save = useCallback(async () => {
    if (!name.trim() || !waypoints.length) return;
    const r = await controlPlane.createMission({ name: name.trim(), waypoints });
    if (r.ok) {
      toast.ok("Mission saved");
      setEditing(false);
      setName("");
      setWaypoints([]);
      load();
    } else {
      // The server refuses a mission whose waypoints breach the account
      // ceiling at save time rather than at fly time — discovering it standing
      // in a field with the aircraft already armed is the wrong moment.
      toast.err((r.data as { error?: string })?.error || "Could not save that mission.");
    }
  }, [name, waypoints, load, toast]);

  const remove = useCallback(
    async (m: Mission) => {
      const r = await controlPlane.deleteMission(m.id);
      if (r.ok) { toast.ok(`${m.name} deleted`); load(); }
      else toast.err((r.data as { error?: string })?.error || "Could not delete that mission.");
    },
    [load, toast]
  );

  if (error && !missions) return <ErrorState message={error} onRetry={load} />;
  if (!missions) return <LoadingState label="Loading missions" />;

  const overCeiling = limits ? waypoints.some((w) => w.alt > limits.maxAltM) : false;

  return (
    <div className="space-y-5">
      <SectionTitle
        right={
          <Button icon={Plus} onClick={() => setEditing((v) => !v)}>
            New mission
          </Button>
        }
      >
        Saved missions
      </SectionTitle>

      {editing && (
        <Surface>
          <Field label="Mission name">
            <TextInput value={name} onChange={setName} placeholder="North field survey" />
          </Field>

          <div className="mt-4 space-y-2">
            {waypoints.map((w, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[2rem_1fr_1fr_6rem_9rem_2.5rem] sm:items-end">
                <div className="text-xs opacity-60">#{i + 1}</div>
                <Field label={i === 0 ? "Latitude" : ""}>
                  <NumberInput value={w.lat} onChange={(v) => patch(i, { lat: v })} step={0.0001} min={-90} max={90} />
                </Field>
                <Field label={i === 0 ? "Longitude" : ""}>
                  <NumberInput value={w.lon} onChange={(v) => patch(i, { lon: v })} step={0.0001} min={-180} max={180} />
                </Field>
                <Field label={i === 0 ? "Altitude" : ""}>
                  <NumberInput value={w.alt} onChange={(v) => patch(i, { alt: v })} min={1} max={500} />
                </Field>
                <Field label={i === 0 ? "At this point" : ""}>
                  <SelectInput
                    value={w.action ?? "waypoint"}
                    onChange={(v) => patch(i, { action: v })}
                    options={ACTIONS}
                  />
                </Field>
                <Button
                  variant="ghost"
                  icon={Trash2}
                  title="Remove waypoint"
                  onClick={() => setWaypoints((ws) => ws.filter((_, j) => j !== i))}
                />
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button icon={MapPin} onClick={addWaypoint}>Add waypoint</Button>
            {waypoints.length > 1 && (
              <span className="text-xs opacity-60">
                {(routeLength(waypoints) / 1000).toFixed(2)} km over {waypoints.length} waypoints
              </span>
            )}
          </div>

          {overCeiling && limits && (
            <p className="mt-3 text-xs" style={{ color: "#dc2626" }}>
              A waypoint is above the {limits.maxAltM} m ceiling for this account. Lower it, or
              raise the ceiling under Safety — the mission cannot be saved as it is.
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <Button
              variant="primary"
              onClick={() => void save()}
              disabled={!name.trim() || !waypoints.length || overCeiling}
            >
              Save mission
            </Button>
            <Button variant="ghost" onClick={() => { setEditing(false); setWaypoints([]); }}>
              Cancel
            </Button>
          </div>
        </Surface>
      )}

      {!missions.length && !editing ? (
        <EmptyState
          icon={Route}
          title="No missions saved"
          body="A mission is a list of waypoints the aircraft flies on its own. Because the autopilot holds it, the route keeps running even if this link drops."
        />
      ) : (
        <div className="space-y-2">
          {missions.map((m) => {
            const wps = Array.isArray(m.waypoints) ? m.waypoints : [];
            return (
              <Surface key={m.id}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{m.name}</span>
                      <Badge tone="info">{wps.length} waypoints</Badge>
                    </div>
                    <div className="mt-1 text-xs opacity-70">
                      {wps.length > 1 && <>{(routeLength(wps) / 1000).toFixed(2)} km · </>}
                      up to {Math.max(...wps.map((w) => w.alt), 0)} m
                    </div>
                  </div>
                  <Button variant="ghost" icon={Trash2} title="Delete" onClick={() => void remove(m)} />
                </div>
              </Surface>
            );
          })}
        </div>
      )}

      <p className="text-xs opacity-60">
        Missions are uploaded to the aircraft before they run. Start one from the Live tab with the
        aircraft on the ground and ready — the autopilot flies it from there, with no dependency on
        this connection.
      </p>
    </div>
  );
}
