"use client";

import { useMemo, useState } from "react";
import { DollarSign, Info } from "lucide-react";
import {
  Button,
  Callout,
  Field,
  formatEnergy,
  formatWatts,
  Kpi,
  KpiGrid,
  NumberInput,
  SectionTitle,
  SelectInput,
  Surface,
  SwitchRow,
  TextInput,
  usePersistentState,
} from "../_kit/primitives";
import { BarChart, CHART_COLORS } from "../_kit/charts";
import { useEnergy } from "../_data/hooks";
import {
  DEFAULT_TARIFF,
  flatCost,
  formatCost,
  touRateForHour,
  type RateModel,
  type Tariff,
  type TouBand,
} from "./tariff";

export default function CostPanel() {
  const [tariff, setTariff, loaded] = usePersistentState<Tariff>(
    "cv:energy:tariff",
    DEFAULT_TARIFF
  );

  const { summary, todayKwh, liveWatts, byDevice, loading } = useEnergy();

  // Estimated today's cost from real measured kWh × tariff.
  const todayCostEstimate = useMemo(() => {
    if (todayKwh == null) return null;
    const energyCost =
      tariff.model === "flat"
        ? flatCost(todayKwh, tariff)
        : // For ToU without a real timestamped series, fall back to flat.
          // The rolling live chart would be needed for accurate ToU; with only
          // today's aggregate kWh the best we can do is the flat rate.
          flatCost(todayKwh, tariff);
    return energyCost + tariff.standingCharge;
  }, [todayKwh, tariff]);

  // Per-device projected hourly cost from live watts.
  const deviceHourlyCosts = useMemo(() => {
    return byDevice
      .filter((d) => d.watts > 0)
      .map((d, i) => {
        const kwhPerHour = d.watts / 1000;
        const costPerHour =
          tariff.model === "flat"
            ? kwhPerHour * tariff.flatRate
            : kwhPerHour * touRateForHour(new Date().getHours(), tariff);
        return {
          label: d.name || d.id,
          value: costPerHour,
          color: CHART_COLORS[i % CHART_COLORS.length],
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [byDevice, tariff]);

  // Projected cost if today's live load runs for 24 h.
  const projectedDailyCost = useMemo(() => {
    if (liveWatts == null) return null;
    const kwhIfFlat = (liveWatts / 1000) * 24;
    return flatCost(kwhIfFlat, tariff) + tariff.standingCharge;
  }, [liveWatts, tariff]);

  const [showBands, setShowBands] = useState(tariff.model === "tou");

  const updateBand = (idx: number, patch: Partial<TouBand>) => {
    setTariff((t) => ({
      ...t,
      bands: t.bands.map((b, i) => (i === idx ? { ...b, ...patch } : b)),
    }));
  };

  const addBand = () => {
    setTariff((t) => ({
      ...t,
      bands: [
        ...t.bands,
        { label: "New band", fromHour: 0, toHour: 6, rate: t.flatRate },
      ],
    }));
  };

  const removeBand = (idx: number) => {
    setTariff((t) => ({ ...t, bands: t.bands.filter((_, i) => i !== idx) }));
  };

  if (!loaded) return null;

  return (
    <div className="space-y-5">
      <Callout tone="info" title="Stored locally in this browser">
        Tariff rates and standing charges are saved in your browser&apos;s local
        storage — they are never sent to the server. All cost figures below are{" "}
        <strong>estimated from your tariff</strong> applied to real measured kWh.
        They are not metered costs.
      </Callout>

      <KpiGrid cols={3}>
        <Kpi
          label="Today's estimated cost"
          value={
            todayCostEstimate != null
              ? formatCost(todayCostEstimate, tariff)
              : "—"
          }
          unit="estimated"
          icon={DollarSign}
          hint={
            todayKwh != null
              ? `from ${formatEnergy(todayKwh)} measured`
              : "awaiting data"
          }
          tone={todayCostEstimate != null ? undefined : undefined}
        />
        <Kpi
          label="Projected daily (at live load)"
          value={
            projectedDailyCost != null
              ? formatCost(projectedDailyCost, tariff)
              : "—"
          }
          unit="estimated"
          hint={
            liveWatts != null ? `if ${formatWatts(liveWatts)} runs 24 h` : undefined
          }
        />
        <Kpi
          label="Standing charge"
          value={formatCost(tariff.standingCharge, tariff)}
          unit="per day"
          icon={Info}
          hint="fixed daily fee, from your tariff"
        />
      </KpiGrid>

      {deviceHourlyCosts.length > 0 && (
        <>
          <SectionTitle>Per-device hourly cost rate (estimated from your tariff)</SectionTitle>
          <BarChart
            data={deviceHourlyCosts.map((d) => ({
              label: d.label,
              value: parseFloat(d.value.toFixed(5)),
              color: d.color,
            }))}
            title="Projected cost per hour at current draw"
            horizontal
            unit={` ${tariff.symbol}/hr`}
          />
          <p className="text-[11px]" style={{ color: "var(--cv-muted)" }}>
            Figures use live watts and your{" "}
            {tariff.model === "flat" ? "flat" : "current-hour ToU"} rate. They
            project what each device costs if it runs at its current draw for an
            hour — not metered actuals.
          </p>
        </>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div />

        <Surface>
          <SectionTitle>Tariff configuration</SectionTitle>
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <Field label="Rate model">
              <SelectInput<RateModel>
                value={tariff.model}
                onChange={(v) => {
                  setTariff((t) => ({ ...t, model: v }));
                  setShowBands(v === "tou");
                }}
                options={[
                  { value: "flat", label: "Flat rate" },
                  { value: "tou", label: "Time of use (ToU)" },
                ]}
              />
            </Field>

            <Field label="Currency symbol" hint='e.g. $, £, €, ₹'>
              <TextInput
                value={tariff.symbol}
                onChange={(v) => setTariff((t) => ({ ...t, symbol: v.slice(0, 3) }))}
                placeholder="$"
              />
            </Field>

            <Field
              label={`Flat rate (${tariff.symbol}/kWh)`}
              hint={
                tariff.model === "tou"
                  ? "Used as fallback when no ToU band matches"
                  : undefined
              }
            >
              <NumberInput
                value={tariff.flatRate}
                onChange={(v) => setTariff((t) => ({ ...t, flatRate: v }))}
                min={0}
                step={0.001}
              />
            </Field>

            <Field
              label={`Standing charge (${tariff.symbol}/day)`}
              hint="Fixed daily charge regardless of usage"
            >
              <NumberInput
                value={tariff.standingCharge}
                onChange={(v) => setTariff((t) => ({ ...t, standingCharge: v }))}
                min={0}
                step={0.01}
              />
            </Field>

            {tariff.model === "tou" && (
              <div className="space-y-3">
                <div
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--cv-muted)" }}
                >
                  ToU bands
                </div>
                {tariff.bands.map((band, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border p-3 space-y-3"
                    style={{ borderColor: "var(--cv-border)" }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <TextInput
                        value={band.label}
                        onChange={(v) => updateBand(idx, { label: v })}
                        placeholder="Band label"
                      />
                      <Button
                        variant="danger"
                        onClick={() => removeBand(idx)}
                        title="Remove band"
                      >
                        Remove
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="From hour">
                        <NumberInput
                          value={band.fromHour}
                          onChange={(v) => updateBand(idx, { fromHour: Math.round(v) % 24 })}
                          min={0}
                          max={23}
                          step={1}
                        />
                      </Field>
                      <Field label="To hour">
                        <NumberInput
                          value={band.toHour}
                          onChange={(v) => updateBand(idx, { toHour: Math.round(v) % 24 })}
                          min={0}
                          max={23}
                          step={1}
                        />
                      </Field>
                      <Field label={`Rate (${tariff.symbol}/kWh)`}>
                        <NumberInput
                          value={band.rate}
                          onChange={(v) => updateBand(idx, { rate: v })}
                          min={0}
                          step={0.001}
                        />
                      </Field>
                    </div>
                  </div>
                ))}
                <Button variant="secondary" onClick={addBand}>
                  + Add band
                </Button>
              </div>
            )}

            <div
              className="border-t pt-4"
              style={{ borderColor: "var(--cv-border)" }}
            >
              <Button
                variant="ghost"
                onClick={() => {
                  setTariff(DEFAULT_TARIFF);
                  setShowBands(DEFAULT_TARIFF.model === "tou");
                }}
              >
                Reset to defaults
              </Button>
            </div>
          </form>
        </Surface>
      </div>

      {tariff.model === "tou" && tariff.bands.length > 0 && (
        <Callout tone="info">
          ToU band cost is applied using the current clock hour. For accurate
          historical cost estimation, per-band kWh data would be required from
          the API — not currently available. Today&apos;s cost above uses the flat rate
          as a conservative fallback.
        </Callout>
      )}
    </div>
  );
}
