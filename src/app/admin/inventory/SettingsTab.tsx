"use client";

import { useCallback, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { invGet, invSend, card, inputStyle, inputCls, Btn, Spinner, Field } from "./lib";

interface Settings {
  lowStockThreshold: number; deadStockDays: number; expiryWarnDays: number;
  currency: string; autoReorderSuggest: boolean; valuationMethod: "cost" | "retail"; defaultLocationId?: string;
}
interface Loc { id: string; name: string }

export default function SettingsTab() {
  const [s, setS] = useState<Settings | null>(null);
  const [locs, setLocs] = useState<Loc[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const [r, l] = await Promise.all([invGet<{ settings: Settings }>("/settings"), invGet<{ locations: Loc[] }>("/locations")]);
    if (r?.settings) setS(r.settings);
    if (l?.locations) setLocs(l.locations);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!s) return <Spinner />;
  const set = (k: keyof Settings, v: any) => setS((p) => ({ ...(p as Settings), [k]: v }));
  const save = async () => {
    setBusy(true); setMsg("");
    const r = await invSend("PATCH", "/settings", s);
    setMsg(r.ok ? "Saved." : "Could not save.");
    setBusy(false);
  };

  return (
    <div className="max-w-2xl rounded-2xl p-6" style={card}>
      <h3 className="mb-4 text-lg font-bold" style={{ color: "var(--text-primary)" }}>Inventory settings</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Low-stock threshold (default reorder point)"><input type="number" value={String(s.lowStockThreshold)} onChange={(e) => set("lowStockThreshold", Number(e.target.value))} className={`${inputCls} w-full`} style={inputStyle} /></Field>
        <Field label="Dead-stock window (days without sale)"><input type="number" value={String(s.deadStockDays)} onChange={(e) => set("deadStockDays", Number(e.target.value))} className={`${inputCls} w-full`} style={inputStyle} /></Field>
        <Field label="Expiry warning (days ahead)"><input type="number" value={String(s.expiryWarnDays)} onChange={(e) => set("expiryWarnDays", Number(e.target.value))} className={`${inputCls} w-full`} style={inputStyle} /></Field>
        <Field label="Currency"><input value={s.currency} onChange={(e) => set("currency", e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></Field>
        <Field label="Valuation method">
          <select value={s.valuationMethod} onChange={(e) => set("valuationMethod", e.target.value)} className={`${inputCls} w-full`} style={inputStyle}>
            <option value="cost">Cost price</option><option value="retail">Retail price</option>
          </select>
        </Field>
        <Field label="Default location">
          <select value={s.defaultLocationId || ""} onChange={(e) => set("defaultLocationId", e.target.value)} className={`${inputCls} w-full`} style={inputStyle}>
            <option value="">— none —</option>
            {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
        <input type="checkbox" checked={s.autoReorderSuggest} onChange={(e) => set("autoReorderSuggest", e.target.checked)} /> Show reorder suggestions when stock is low
      </label>
      <div className="mt-5 flex items-center gap-3">
        <Btn onClick={save} disabled={busy}><Save className="h-4 w-4" /> {busy ? "Saving…" : "Save settings"}</Btn>
        {msg && <span className="text-sm" style={{ color: "var(--accent-cyan)" }}>{msg}</span>}
      </div>
    </div>
  );
}
