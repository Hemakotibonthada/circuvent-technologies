"use client";

/**
 * Feeds the advisor with what the console already knows.
 *
 * No inference is needed for the common case and none is attempted. A device
 * that reports watts is metering itself — a smart plug, an energy monitor, a
 * channel on a cv-em3 — so its consumption is a measurement, not an estimate.
 * A device that reports nothing is listed as unknown rather than guessed at,
 * because "we cannot see this one" is something an operator can act on by
 * fitting a meter, and a confident wrong number is not.
 */
import { useEffect, useMemo, useState } from "react";
import { controlPlane, type Device } from "@/lib/control-plane";
import { usePersistentState } from "../_kit/primitives";
import { DEFAULT_TARIFF, type Tariff } from "./tariff";
import { attributeConsumption } from "@/lib/load-attribution";
import type { EnergyDevice } from "@/lib/energy-advisor";
import AdvisorPanel from "./AdvisorPanel";
import { useConsoleTheme } from "../theme";

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Whether this device's primary switch is on, whatever it calls it. */
function isOn(d: Device): boolean {
  const s = d.state ?? {};
  for (const key of ["power", "on", "pump", "relay"]) {
    if (typeof s[key] === "boolean") return s[key] as boolean;
  }
  return false;
}

export default function AdvisorPanelContainer() {
  const { cardClass } = useConsoleTheme();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // The same key CostPanel uses, so a tariff configured there is the one the
  // advice is priced against. Two tariffs would be two different bills.
  const [tariff] = usePersistentState<Tariff>("cv:energy:tariff", DEFAULT_TARIFF);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await controlPlane.devices();
      if (cancelled) return;
      if (r.ok) setDevices(r.data.devices ?? []);
      else setErr("Could not reach the smart-home service.");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const energyDevices: EnergyDevice[] = useMemo(
    () =>
      devices.map((d) => ({
        id: d.id,
        name: d.name || d.id,
        type: d.type,
        watts: num(d.state?.watts),
        on: isOn(d),
      })),
    [devices]
  );

  const { profiles, totalWatts } = useMemo(() => {
    const metered = energyDevices
      .filter((d) => d.watts != null)
      .map((d) => ({ key: d.name || d.id, watts: d.watts as number }));

    // Everything else is named so the breakdown does not look complete when
    // it is not.
    const unmetered = energyDevices.filter((d) => d.watts == null).map((d) => d.name || d.id);

    return {
      profiles: attributeConsumption(metered, {}, unmetered),
      totalWatts: metered.reduce((s, m) => s + m.watts, 0),
    };
  }, [energyDevices]);

  // The breakdown keys on display name, so the on-map has to as well.
  const named: EnergyDevice[] = useMemo(
    () => energyDevices.map((d) => ({ ...d, id: d.name || d.id })),
    [energyDevices]
  );

  if (loading) {
    return (
      <div className={`${cardClass} p-6`}>
        <p className="text-sm" style={{ color: "var(--cv-muted)" }}>
          Reading your devices…
        </p>
      </div>
    );
  }

  if (err) {
    return (
      <div className={`${cardClass} p-6`}>
        <p className="text-sm" style={{ color: "var(--cv-muted)" }}>
          {err}
        </p>
      </div>
    );
  }

  return (
    <AdvisorPanel
      devices={named}
      tariff={tariff}
      profiles={profiles}
      totalWatts={totalWatts}
    />
  );
}
