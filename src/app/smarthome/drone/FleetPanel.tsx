"use client";

/**
 * Fleet — aircraft and the battery register.
 *
 * WHY BATTERIES GET A PANEL AND MOTORS DO NOT
 *
 * A lithium pack is the only part of a multirotor that wears out on a schedule
 * anybody can act on. It degrades predictably over a couple of hundred cycles,
 * loses the ability to hold voltage under load, and then sags below the point
 * where the aircraft can stay up — usually on the last leg home, because that
 * is when it is emptiest.
 *
 * Cycles are counted per pack, not per airframe, because the airframe cannot
 * tell you which pack was on it. The whole industry manages packs this way,
 * and it is what turns "something on this drone is getting old" into "retire
 * this one".
 */

import { useCallback, useEffect, useState } from "react";
import { BatteryWarning, Plane, Plus, Trash2 } from "lucide-react";
import { controlPlane, type Battery, type LiveAircraft } from "@/lib/control-plane";
import {
  Badge, Button, EmptyState, ErrorState, Field, LoadingState, Meter, NumberInput,
  SectionTitle, StatusDot, Surface, TextInput, formatRelative,
} from "../_kit/primitives";
import { useToast } from "../_kit/overlays";

export function FleetPanel() {
  const toast = useToast();
  const [aircraft, setAircraft] = useState<LiveAircraft[] | null>(null);
  const [batteries, setBatteries] = useState<Battery[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [cells, setCells] = useState(4);
  const [capacity, setCapacity] = useState(5000);
  const [retireAt, setRetireAt] = useState(200);

  const load = useCallback(() => {
    void Promise.all([controlPlane.droneLive(), controlPlane.batteries()]).then(([live, packs]) => {
      if (live.ok) setAircraft(live.data.aircraft ?? []);
      else setAircraft((prev) => prev ?? []);
      if (packs.ok) setBatteries(packs.data.batteries ?? []);
      else setBatteries((prev) => prev ?? []);
      if (!live.ok && !packs.ok) {
        setError((live.data as { error?: string })?.error || "Could not load the fleet.");
      } else {
        setError(null);
      }
    });
  }, []);

  useEffect(load, [load]);

  const add = useCallback(async () => {
    if (!label.trim()) return;
    const r = await controlPlane.addBattery({
      label: label.trim(), cells, capacityMah: capacity, retireAt,
    });
    if (r.ok) {
      setLabel("");
      setAdding(false);
      toast.ok("Battery added");
      load();
    } else {
      toast.err((r.data as { error?: string })?.error || "Could not add that battery.");
    }
  }, [label, cells, capacity, retireAt, load, toast]);

  const remove = useCallback(
    async (b: Battery) => {
      const r = await controlPlane.deleteBattery(b.id);
      if (r.ok) { toast.ok(`${b.label} removed`); load(); }
      else toast.err((r.data as { error?: string })?.error || "Could not remove that battery.");
    },
    [load, toast]
  );

  const retire = useCallback(
    async (b: Battery) => {
      const r = await controlPlane.updateBattery(b.id, { retired: !b.retired });
      if (r.ok) load();
      else toast.err((r.data as { error?: string })?.error || "Could not update that battery.");
    },
    [load, toast]
  );

  if (error && !aircraft) return <ErrorState message={error} onRetry={load} />;
  if (!aircraft || !batteries) return <LoadingState label="Loading fleet" />;

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle>Aircraft</SectionTitle>
        {!aircraft.length ? (
          <EmptyState
            icon={Plane}
            title="No aircraft"
            body="Claim a Circuvent Drone Link and it will appear here."
          />
        ) : (
          <div className="mt-2 space-y-2">
            {aircraft.map((a) => {
              const st = a.state ?? {};
              return (
                <Surface key={a.deviceId}>
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusDot online={a.online} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{a.name || a.deviceId}</div>
                      <div className="text-xs opacity-70">
                        {a.deviceId}
                        {typeof st.board === "string" && <> · {st.board}</>}
                        {typeof st.mavGood === "number" && (
                          <> · {st.mavGood} MAVLink frames{
                            typeof st.mavBad === "number" && st.mavBad > 0
                              ? `, ${st.mavBad} bad`
                              : ""
                          }</>
                        )}
                      </div>
                    </div>
                    {a.flightId && <Badge tone="info">Flying</Badge>}
                    {st.allowArm === false && <Badge tone="warning">Grounded</Badge>}
                  </div>
                </Surface>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <SectionTitle
          right={
            <Button icon={Plus} onClick={() => setAdding((v) => !v)}>
              Add battery
            </Button>
          }
        >
          Batteries
        </SectionTitle>

        {adding && (
          <Surface className="mt-2">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Label" hint="What is written on the pack">
                <TextInput value={label} onChange={setLabel} placeholder="Pack A" />
              </Field>
              <Field label="Cells">
                <NumberInput value={cells} onChange={setCells} min={1} max={14} />
              </Field>
              <Field label="Capacity" hint="mAh">
                <NumberInput value={capacity} onChange={setCapacity} min={100} max={100000} step={100} />
              </Field>
              <Field label="Retire after" hint="cycles">
                <NumberInput value={retireAt} onChange={setRetireAt} min={10} max={5000} step={10} />
              </Field>
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="primary" onClick={() => void add()} disabled={!label.trim()}>
                Add
              </Button>
              <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </Surface>
        )}

        {!batteries.length && !adding ? (
          <EmptyState
            icon={BatteryWarning}
            title="No batteries tracked"
            body="Add each pack you fly. A cycle is counted every time a flight it was assigned to lands, so the console can tell you when to retire it."
          />
        ) : (
          <div className="mt-2 space-y-2">
            {batteries.map((b) => (
              <Surface key={b.id}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{b.label}</span>
                      <span className="text-xs opacity-60">
                        {b.cells}S · {b.capacityMah} mAh
                      </span>
                      {b.retired ? (
                        <Badge tone="critical">Retired</Badge>
                      ) : b.health === "retire" ? (
                        <Badge tone="critical">Retire now</Badge>
                      ) : b.health === "ageing" ? (
                        <Badge tone="warning">Ageing</Badge>
                      ) : (
                        <Badge tone="ok">Good</Badge>
                      )}
                    </div>
                    <div className="mt-1.5">
                      <Meter
                        value={Math.min(b.cycles, b.retireAt)}
                        max={b.retireAt}
                        tone={b.health === "retire" ? "critical" : b.health === "ageing" ? "warning" : "ok"}
                        label={`${b.cycles} of ${b.retireAt} cycles`}
                      />
                    </div>
                    {b.lastUsed && (
                      <div className="mt-1 text-xs opacity-60">
                        Last flown {formatRelative(b.lastUsed)}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => void retire(b)}>
                      {b.retired ? "Return to service" : "Retire"}
                    </Button>
                    <Button variant="ghost" icon={Trash2} onClick={() => void remove(b)} title="Remove" />
                  </div>
                </div>
              </Surface>
            ))}
          </div>
        )}

        {/*
          * Said once, here, rather than repeated on every row: a cycle is only
          * counted on a clean landing of a flight the pack was assigned to. A
          * flight that ended in silence has an unknown ending, and inventing a
          * cycle for it would slowly inflate the number a retirement decision
          * is made from.
          */}
        <p className="mt-3 text-xs opacity-60">
          A cycle is counted when a flight this pack was assigned to lands cleanly. Flights that
          ended without a landing do not count one, because nobody knows how they ended.
        </p>
      </div>
    </div>
  );
}
