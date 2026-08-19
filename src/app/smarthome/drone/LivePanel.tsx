"use client";

/**
 * Live flight — the panel an operator watches while an aircraft is in the air.
 *
 * THE ONE RULE THIS UI FOLLOWS
 *
 * Every control here sends a *whole intent*: take off to an altitude, go to a
 * coordinate, return home, land. There is deliberately no joystick, no
 * "nudge forward", no press-and-hold. Continuous manual control over a link
 * with reconnect backoff and a radio that fades behind a building is not
 * control — it is a way of discovering where the aircraft ends up when the
 * last packet through was the one that said "forward".
 *
 * Refusals are shown, never swallowed. The server answers a blocked command
 * with 409 and a reason written for a person; an operator who taps "return
 * home" and sees nothing happen will tap it again, and then start looking for
 * the transmitter.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, BatteryMedium, Compass, Gauge, Home, Navigation,
  Plane, PlaneLanding, PlaneTakeoff, Power, Radio, Satellite, ShieldAlert, Square,
} from "lucide-react";
import { controlPlane, type DroneCommand, type LiveAircraft, type DroneLimits } from "@/lib/control-plane";
import {
  Badge, Button, Callout, EmptyState, ErrorState, Field, Kpi, KpiGrid, LoadingState,
  NumberInput, SectionTitle, StatusDot, Surface, useVisiblePolling,
} from "../_kit/primitives";
import { useToast } from "../_kit/overlays";
import { describeFailure, isUnsupported } from "./errors";
import { NeedsDeploy } from "./NeedsDeploy";

function num(state: Record<string, unknown>, key: string): number | null {
  const v = state[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(state: Record<string, unknown>, key: string): string | null {
  const v = state[key];
  return typeof v === "string" ? v : null;
}
function bool(state: Record<string, unknown>, key: string): boolean {
  return state[key] === true;
}

const MODE_LABEL: Record<string, string> = {
  loiter: "Loiter", althold: "Altitude hold", poshold: "Position hold",
  guided: "Guided", auto: "Mission", rtl: "Returning home",
  smartrtl: "Smart return", land: "Landing", brake: "Braking",
  stabilize: "Stabilise", acro: "Acro", circle: "Circle", unknown: "—",
};

export function LivePanel() {
  const toast = useToast();
  const [aircraft, setAircraft] = useState<LiveAircraft[] | null>(null);
  const [limits, setLimits] = useState<DroneLimits | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [takeoffAlt, setTakeoffAlt] = useState(15);
  const [confirmKill, setConfirmKill] = useState(false);

  const load = useCallback(() => {
    void controlPlane.droneLive().then((r) => {
      if (r.ok) {
        setAircraft(r.data.aircraft ?? []);
        setLimits(r.data.limits ?? null);
        setError(null);
        setUnsupported(false);
        setSelected((cur) => cur ?? r.data.aircraft?.[0]?.deviceId ?? null);
      } else if (isUnsupported(r)) {
        // The control plane predates this feature. Not an error, and retrying
        // cannot help — so it gets guidance instead of a red banner.
        setUnsupported(true);
        setAircraft([]);
      } else {
        setError(describeFailure(r, "aircraft"));
        setAircraft((prev) => prev ?? []);
      }
    });
  }, []);

  useEffect(load, [load]);
  /*
   * Two seconds, not the console's usual ten or twenty.
   *
   * This is the only panel where a stale number changes what a person does: an
   * altitude four seconds old is four seconds of descent they cannot see.
   * `useVisiblePolling` stops when the tab is hidden, so an operator who
   * leaves the page open overnight is not holding the link open for nothing.
   */
  useVisiblePolling(load, 2000);

  const active = useMemo(
    () => aircraft?.find((a) => a.deviceId === selected) ?? null,
    [aircraft, selected]
  );

  const send = useCallback(
    async (body: DroneCommand, label: string) => {
      if (!active) return;
      setBusy(body.action);
      try {
        const r = await controlPlane.droneCommand(active.deviceId, body);
        if (r.ok) {
          toast.ok(`${label} sent`);
          setTimeout(load, 400);
        } else {
          /*
           * A refusal is a 409 with a reason written for a person — "too few
           * satellites", not "not_ready". It must be shown, never swallowed:
           * an operator who taps "return home" and sees nothing happen will
           * tap it again, and then start looking for the transmitter.
           */
          toast.err(describeFailure(r, "that command"));
        }
      } finally {
        setBusy(null);
        setConfirmKill(false);
      }
    },
    [active, load, toast]
  );

  if (unsupported) return <NeedsDeploy />;
  if (error && !aircraft) return <ErrorState message={error} onRetry={load} />;
  if (!aircraft) return <LoadingState label="Loading aircraft" />;

  if (!aircraft.length) {
    return (
      <EmptyState
        icon={Plane}
        title="No aircraft yet"
        body="Add a Circuvent Drone Link to your account and it will appear here with live telemetry."
      />
    );
  }

  const st = active?.state ?? {};
  const armed = bool(st, "armed");
  const inAir = bool(st, "inAir");
  const ready = bool(st, "ready");
  const linked = bool(st, "link");
  const alt = num(st, "alt");
  const battPct = num(st, "battPct");
  const sats = num(st, "sats");
  const distHome = num(st, "distHome");
  const flightSec = num(st, "flightSec");
  const mode = str(st, "mode") ?? "unknown";
  const readyReason = str(st, "readyReason");

  return (
    <div className="space-y-5">
      {aircraft.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {aircraft.map((a) => (
            <button
              key={a.deviceId}
              onClick={() => setSelected(a.deviceId)}
              className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition"
              style={{
                borderColor: a.deviceId === selected ? "var(--cv-accent-hi)" : "var(--cv-border)",
                background: a.deviceId === selected ? "var(--cv-accent-dim)" : "transparent",
              }}
            >
              <StatusDot online={a.online} />
              <span className="font-medium">{a.name || a.deviceId}</span>
              {a.flightId && <Badge tone="info">Flying</Badge>}
            </button>
          ))}
        </div>
      )}

      {active && (
        <>
          {/* Warnings above the numbers: anything wrong has to be seen before
              the reassuring green figures next to it. */}
          {active.warnings.map((w) => (
            <Callout key={w} tone="warning">{w}</Callout>
          ))}

          {!active.online && (
            <Callout tone="critical" title="No telemetry">
              Everything below is the last thing this aircraft said, not what it is doing now.
            </Callout>
          )}

          <KpiGrid>
            <Kpi
              label="State"
              value={inAir ? "Airborne" : armed ? "Armed" : "On the ground"}
              icon={Plane}
              tone={inAir ? "info" : armed ? "warning" : undefined}
            />
            <Kpi label="Mode" value={MODE_LABEL[mode] ?? mode} icon={Compass} />
            <Kpi
              label="Altitude"
              value={alt === null ? "—" : alt.toFixed(1)}
              unit="m"
              icon={Gauge}
              tone={limits && alt !== null && alt > limits.maxAltM ? "critical" : undefined}
            />
            <Kpi
              label="Battery"
              value={battPct === null || battPct < 0 ? "—" : battPct}
              unit={battPct !== null && battPct >= 0 ? "%" : undefined}
              icon={BatteryMedium}
              tone={
                battPct !== null && battPct >= 0 && limits && battPct < limits.minBattPct
                  ? "critical"
                  : undefined
              }
            />
            <Kpi
              label="Satellites"
              value={sats === null ? "—" : sats}
              icon={Satellite}
              tone={sats !== null && sats > 0 && sats < 8 ? "warning" : undefined}
            />
            <Kpi
              label="From home"
              value={distHome === null ? "—" : Math.round(distHome)}
              unit={distHome === null ? undefined : "m"}
              icon={Home}
            />
          </KpiGrid>

          {/* The preflight verdict, in the aircraft's own words. A generic
              "not ready" sends a pilot looking; "too few satellites" sends
              them to the right place. */}
          {!inAir && (
            <Surface>
              <div className="flex items-center gap-3">
                <StatusDot online={ready} pulse={false} />
                <div>
                  <div className="text-sm font-semibold">
                    {ready ? "Ready to fly" : "Not ready to fly"}
                  </div>
                  {readyReason && readyReason !== "ready" && (
                    <div className="text-xs opacity-70">{readyReason}</div>
                  )}
                </div>
              </div>
            </Surface>
          )}

          <Surface>
            <SectionTitle>Flight controls</SectionTitle>

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <Field label="Take-off altitude" hint={`Ceiling ${limits?.maxAltM ?? 120} m`}>
                <NumberInput
                  value={takeoffAlt}
                  onChange={setTakeoffAlt}
                  min={1}
                  max={limits?.maxAltM ?? 120}
                />
              </Field>
              <Button
                variant="primary"
                onClick={() => void send({ action: "takeoff", alt: takeoffAlt }, "Take-off")}
                disabled={!!busy || inAir || !linked}
                busy={busy === "takeoff"}
                icon={PlaneTakeoff}
              >
                Take off
              </Button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                onClick={() => void send({ action: "rtl" }, "Return home")}
                disabled={!!busy}
                busy={busy === "rtl"}
                icon={Home}
              >
                Return home
              </Button>
              <Button
                onClick={() => void send({ action: "land" }, "Land")}
                disabled={!!busy}
                busy={busy === "land"}
                icon={PlaneLanding}
              >
                Land here
              </Button>
              <Button
                onClick={() => void send({ action: "loiter" }, "Hold position")}
                disabled={!!busy}
                busy={busy === "loiter"}
                icon={Navigation}
              >
                Hold position
              </Button>
              <Button
                onClick={() => void send({ action: "brake" }, "Brake")}
                disabled={!!busy}
                busy={busy === "brake"}
                icon={Square}
              >
                Stop
              </Button>
            </div>

            <div
              className="mt-4 flex flex-wrap items-center gap-2 pt-4"
              style={{ borderTop: "1px solid var(--cv-border)" }}
            >
              <Button
                onClick={() => void send({ action: "arm" }, "Arm")}
                disabled={!!busy || armed || !linked}
                busy={busy === "arm"}
                icon={Power}
              >
                Arm
              </Button>

              {/*
                * Disarm is split in two, and the airborne one is not reachable
                * in a single click.
                *
                * On the ground it is routine. In the air it cuts the motors — a
                * legitimate last resort when an aircraft is heading for a
                * crowd, and a catastrophe when somebody meant "tidy up after
                * landing". In every ground station ever built those two are one
                * tap apart. Here they are not.
                */}
              {!inAir ? (
                <Button
                  onClick={() => void send({ action: "disarm" }, "Disarm")}
                  disabled={!!busy || !armed}
                  busy={busy === "disarm"}
                  icon={Power}
                >
                  Disarm
                </Button>
              ) : confirmKill ? (
                <div
                  className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2"
                  style={{ background: "rgba(220,38,38,0.14)", border: "1px solid #dc262655" }}
                >
                  <ShieldAlert className="h-4 w-4" style={{ color: "#dc2626" }} />
                  <span className="text-sm">
                    This cuts the motors. The aircraft will fall from{" "}
                    {alt === null ? "its current altitude" : `${alt.toFixed(0)} m`}.
                  </span>
                  <Button
                    variant="danger"
                    onClick={() => void send({ action: "disarm", force: true }, "Emergency stop")}
                    disabled={!!busy}
                    busy={busy === "disarm"}
                  >
                    Cut motors
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmKill(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" onClick={() => setConfirmKill(true)} icon={ShieldAlert}>
                  Emergency stop…
                </Button>
              )}
            </div>

            <p className="mt-4 text-xs opacity-60">
              Every command here is a complete instruction the aircraft can finish on its own. If
              the link drops mid-flight the autopilot&rsquo;s own failsafe takes over — this page is
              never in the control loop.
            </p>
          </Surface>

          {/*
            Bench tools.
            
            Kept in their own surface, below the flight commands and only while
            the aircraft is on the ground, because they are the opposite kind of
            thing: they drive a motor directly with no controller behind it. The
            control plane refuses each one on anything that might be airborne
            and the firmware refuses them again, but the strongest signal is not
            offering them next to "Take-off".
          */}
          {!bool(active.state, "inAir") && !bool(active.state, "armed") && (
            <Surface>
              <h3 className="text-sm font-semibold">Bench tools</h3>
              <p className="mt-1 text-xs opacity-70">
                For an aircraft on the bench or in a hedge — not for one that is flying.
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  busy={busy === "beep"}
                  onClick={() => void send({ action: "beep" }, "Locator beep")}
                >
                  Find it (beep)
                </Button>
                <Button
                  variant="ghost"
                  busy={busy === "turtle"}
                  onClick={() => void send({ action: "turtle", on: true }, "Turtle mode")}
                >
                  Flip it back over
                </Button>
                <Button
                  variant="ghost"
                  busy={busy === "benchStop"}
                  onClick={() => void send({ action: "benchStop" }, "Bench stop")}
                >
                  Stop
                </Button>
              </div>

              <div className="mt-4">
                <p className="text-xs font-medium">Motor test</p>
                <p className="mt-0.5 text-xs opacity-70">
                  Spins one motor at 10% so you can check order and direction.{" "}
                  <strong>Take the propellers off first.</strong>
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[0, 1, 2, 3].map((m) => (
                    <Button
                      key={m}
                      variant="ghost"
                      busy={busy === "motorTest"}
                      onClick={() =>
                        void send({ action: "motorTest", motor: m, throttle: 0.1 }, `Motor ${m + 1}`)
                      }
                    >
                      M{m + 1}
                    </Button>
                  ))}
                </div>
              </div>
            </Surface>
          )}

          <div className="text-xs opacity-60">
            <Radio className="mr-1 inline h-3 w-3" />
            {active.deviceId}
            {flightSec !== null && flightSec > 0 && (
              <> · armed for {Math.floor(flightSec / 60)}m {flightSec % 60}s</>
            )}
            {active.flightId && <> · flight #{active.flightId}</>}
          </div>
        </>
      )}
    </div>
  );
}
