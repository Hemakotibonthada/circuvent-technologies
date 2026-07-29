import React, { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Screen, useBackHandler, useTheme } from "../../../ui";
import { ActionButton, Callout, ConfirmDialog, ScreenHeader, SelectField, Stepper, TextField } from "../../../enterprise-ui";
import { costOf, DEFAULT_TARIFF, formatMoney, rateAtHour, tariffStore, windowAtHour, type Slab, type Tariff, type TariffKind, type TouWindow } from "../../../enterprise";
import { HonestEmpty, InlineLoading, ScreenBody, SectionCard } from "./parts";
import { normalizeTariff, useTariff } from "./useEnergy";

interface Props { onBack: () => void }

const KIND_OPTIONS: { value: TariffKind; label: string }[] = [
  { value: "flat", label: "Flat" },
  { value: "tou", label: "Time of use" },
  { value: "slab", label: "Slab" },
];

export default function TariffSettings({ onBack }: Props) {
  const { c } = useTheme();
  const { tariff, loading, save, reset } = useTariff();
  const [draft, setDraft] = useState<Tariff>(DEFAULT_TARIFF);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [guard, setGuard] = useState(false);

  React.useEffect(() => {
    if (!loading) {
      setDraft(tariff);
      setReady(true);
    }
  }, [loading, tariff]);

  const dirty = useMemo(() => JSON.stringify(normalizeTariff(draft)) !== JSON.stringify(normalizeTariff(tariff)), [draft, tariff]);
  const errors = useMemo(() => validateTariff(draft), [draft]);
  const hasErrors = Object.keys(errors).length > 0;

  const leave = () => {
    if (dirty) setGuard(true);
    else onBack();
  };
  useBackHandler(() => {
    if (dirty) {
      setGuard(true);
      return true;
    }
    return false;
  });

  const patch = (p: Partial<Tariff>) => setDraft((t) => ({ ...t, ...p }));
  const updateWindow = (idx: number, p: Partial<TouWindow>) => patch({ windows: draft.windows.map((w, i) => i === idx ? { ...w, ...p } : w) });
  const updateSlab = (idx: number, p: Partial<Slab>) => patch({ slabs: draft.slabs.map((s, i) => i === idx ? { ...s, ...p } : s) });

  const onSave = async () => {
    setSaving(true);
    await save(draft);
    setSaving(false);
  };

  const onReset = async () => {
    setSaving(true);
    await reset();
    await tariffStore.save(DEFAULT_TARIFF);
    setDraft(DEFAULT_TARIFF);
    setSaving(false);
  };

  if (!ready) return <Screen><ScreenHeader title="Tariff settings" subtitle="Operator-entered estimate rates" onBack={leave} /><InlineLoading /></Screen>;

  return (
    <Screen>
      <ScreenHeader title="Tariff settings" subtitle="Local-only rate card for estimates" onBack={leave} actions={[{ icon: "save", label: "Save tariff", onPress: onSave }]} />
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <ScreenBody>
          <Callout kind="warning" title="Estimates only" text="These user-supplied rates are stored on this device and used only for on-device estimates. The platform does not receive billing data, and displayed costs are not billed amounts." icon="tariff" />

          <SectionCard title="Rate model" subtitle="Choose the way your utility charges for energy." icon="tariff">
            <SelectField label="Tariff kind" value={draft.kind} options={KIND_OPTIONS} onChange={(kind) => patch({ kind })} />
            <TextField label="Currency symbol" value={draft.currency} onChange={(currency) => patch({ currency })} placeholder="₹" error={errors.currency} />
            <Stepper label="Standing charge" value={draft.standingCharge} onChange={(standingCharge) => patch({ standingCharge })} min={0} max={100000} step={10} unit={draft.currency} help="Monthly fixed charge included only in monthly projections." />
            <Stepper label="Carbon intensity" value={draft.carbonIntensity} onChange={(carbonIntensity) => patch({ carbonIntensity })} min={0} max={5} step={0.01} unit="kg/kWh" help="Use the value published by your local grid or utility." />
          </SectionCard>

          {draft.kind === "flat" ? (
            <SectionCard title="Flat rate" subtitle="One unit rate at all hours." icon="cost">
              <Stepper label="Unit rate" value={draft.flatRate} onChange={(flatRate) => patch({ flatRate })} min={0} max={1000} step={0.1} unit={`${draft.currency}/kWh`} />
              {errors.flatRate ? <Text style={{ color: c.red, fontSize: 12 }}>{errors.flatRate}</Text> : null}
            </SectionCard>
          ) : null}

          {draft.kind === "tou" ? (
            <SectionCard title="Time-of-use windows" subtitle="Hours are local time. End hour is exclusive; wrapping overnight is allowed." icon="clock">
              {draft.windows.map((w, idx) => (
                <View key={`${w.label}-${idx}`} style={{ borderBottomWidth: 1, borderBottomColor: c.border, paddingBottom: 10, marginBottom: 10 }}>
                  <TextField label={`Window ${idx + 1} label`} value={w.label} onChange={(label) => updateWindow(idx, { label })} error={errors[`window-${idx}-label`]} />
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}><Stepper label="Start" value={w.from} onChange={(from) => updateWindow(idx, { from })} min={0} max={23} step={1} unit="h" /></View>
                    <View style={{ flex: 1 }}><Stepper label="End" value={w.to} onChange={(to) => updateWindow(idx, { to })} min={0} max={24} step={1} unit="h" /></View>
                  </View>
                  <Stepper label="Rate" value={w.rate} onChange={(rate) => updateWindow(idx, { rate })} min={0} max={1000} step={0.1} unit={`${draft.currency}/kWh`} />
                  {errors[`window-${idx}`] ? <Text style={{ color: c.red, fontSize: 12, marginBottom: 8 }}>{errors[`window-${idx}`]}</Text> : null}
                  <ActionButton label="Remove window" icon="trash" tone={c.red} outline onPress={() => patch({ windows: draft.windows.filter((_, i) => i !== idx) })} disabled={draft.windows.length <= 1} />
                </View>
              ))}
              {errors.windows ? <Text style={{ color: c.red, fontSize: 12, marginBottom: 8 }}>{errors.windows}</Text> : null}
              <ActionButton label="Add window" icon="add" onPress={() => patch({ windows: [...draft.windows, { label: "New window", from: 0, to: 1, rate: draft.flatRate }] })} />
              <HourStrip tariff={draft} />
            </SectionCard>
          ) : null}

          {draft.kind === "slab" ? (
            <SectionCard title="Slab rates" subtitle="Progressive slabs are charged band by band." icon="table">
              {draft.slabs.map((s, idx) => (
                <View key={idx} style={{ borderBottomWidth: 1, borderBottomColor: c.border, paddingBottom: 10, marginBottom: 10 }}>
                  <Stepper label={idx === draft.slabs.length - 1 ? "Final up to" : "Up to"} value={Number.isFinite(s.upTo) ? s.upTo : 999999} onChange={(upTo) => updateSlab(idx, { upTo })} min={1} max={999999} step={10} unit="kWh" />
                  <Stepper label="Rate" value={s.rate} onChange={(rate) => updateSlab(idx, { rate })} min={0} max={1000} step={0.1} unit={`${draft.currency}/kWh`} />
                  <ActionButton label="Remove slab" icon="trash" tone={c.red} outline onPress={() => patch({ slabs: draft.slabs.filter((_, i) => i !== idx) })} disabled={draft.slabs.length <= 1} />
                </View>
              ))}
              {errors.slabs ? <Text style={{ color: c.red, fontSize: 12, marginBottom: 8 }}>{errors.slabs}</Text> : null}
              <ActionButton label="Add slab" icon="add" onPress={() => patch({ slabs: [...draft.slabs, { upTo: (draft.slabs[draft.slabs.length - 1]?.upTo || 0) + 100, rate: draft.flatRate }] })} />
              <Callout kind="info" title="Worked example" text={`250 kWh would estimate to ${formatMoney(draft, costOf(draft, 250))} before standing charge.`} icon="bill" />
            </SectionCard>
          ) : null}

          {hasErrors ? <Callout kind="warning" title="Fix validation errors" text="Errors are shown next to the affected fields. Save is disabled until the rate card is valid." icon="warning" /> : null}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}><ActionButton label="Reset" icon="restore" outline tone={c.red} busy={saving} onPress={onReset} /></View>
            <View style={{ flex: 1 }}><ActionButton label="Save" icon="save" busy={saving} disabled={hasErrors || !dirty} onPress={onSave} /></View>
          </View>
        </ScreenBody>
      </ScrollView>
      <ConfirmDialog visible={guard} title="Discard unsaved tariff changes?" message="Your edited rate card has not been saved." confirmLabel="Discard" destructive onConfirm={() => { setGuard(false); onBack(); }} onCancel={() => setGuard(false)} />
    </Screen>
  );
}

function HourStrip({ tariff }: { tariff: Tariff }) {
  const { c } = useTheme();
  const hours = Array.from({ length: 24 }, (_, h) => ({ h, win: windowAtHour(tariff, h), rate: rateAtHour(tariff, h) }));
  if (!hours.length) return <HonestEmpty title="No hours" subtitle="Add a TOU window to preview the day." />;
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ color: c.textDim, fontSize: 12, fontWeight: "800", marginBottom: 8 }}>24-hour rate strip</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
        {hours.map(({ h, win, rate }) => (
          <View key={h} style={{ width: 44, minHeight: 44, borderRadius: 10, backgroundColor: win ? c.cardHi : c.surfaceHi, borderWidth: 1, borderColor: win ? c.accent : c.border, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: c.text, fontSize: 11, fontWeight: "900" }}>{h}</Text>
            <Text style={{ color: c.faint, fontSize: 9 }}>{rate}</Text>
          </View>
        ))}
      </View>
      <Text style={{ color: c.faint, fontSize: 12, marginTop: 8 }}>Active now: {windowAtHour(tariff, new Date().getHours())?.label ?? "Fallback flat rate"}</Text>
    </View>
  );
}

function validateTariff(t: Tariff): Record<string, string> {
  const e: Record<string, string> = {};
  if (!t.currency.trim()) e.currency = "Currency is required.";
  if (!Number.isFinite(t.flatRate) || t.flatRate < 0) e.flatRate = "Rate must be zero or higher.";
  if (!Number.isFinite(t.carbonIntensity) || t.carbonIntensity < 0) e.carbonIntensity = "Carbon intensity must be zero or higher.";
  if (t.kind === "tou") {
    const seen: number[] = [];
    t.windows.forEach((w, idx) => {
      if (!w.label.trim()) e[`window-${idx}-label`] = "Label is required.";
      if (!Number.isFinite(w.from) || w.from < 0 || w.from > 23 || !Number.isFinite(w.to) || w.to < 0 || w.to > 24 || w.from === w.to) e[`window-${idx}`] = "Hours must be valid and cannot be equal.";
      if (!Number.isFinite(w.rate) || w.rate < 0) e[`window-${idx}`] = "Rate must be zero or higher.";
      for (let h = 0; h < 24; h++) if (hourInWindow(h, w)) seen.push(h);
    });
    const dup = seen.find((h, i) => seen.indexOf(h) !== i);
    if (dup != null) e.windows = `TOU windows overlap at ${dup}:00.`;
  }
  if (t.kind === "slab") {
    let prev = 0;
    for (const slab of t.slabs) {
      if (!Number.isFinite(slab.upTo) || slab.upTo <= prev || !Number.isFinite(slab.rate) || slab.rate < 0) e.slabs = "Slab thresholds must ascend and rates must be zero or higher.";
      prev = slab.upTo;
    }
  }
  return e;
}

function hourInWindow(hour: number, w: TouWindow): boolean {
  return w.from < w.to ? hour >= w.from && hour < w.to : hour >= w.from || hour < w.to;
}
