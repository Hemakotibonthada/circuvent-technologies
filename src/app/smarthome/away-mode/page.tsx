"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Luggage, Power } from "lucide-react";
import { controlPlane, type Device } from "@/lib/control-plane";
import { getState, saveState, type AwayModeState } from "@/lib/smarthome-away-mode";
import { Card, Toggle } from "../ui";

export default function AwayModePage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [state, setState] = useState<AwayModeState>({ enabled: false, automationIds: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await controlPlane.devices();
    if (r.ok) setDevices(r.data.devices ?? []);
    setState(getState());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activate = async () => {
    if (!state.deviceId) return;
    setBusy(true);
    const morning = await controlPlane.createAutomation({
      name: "Away mode — morning on",
      enabled: true,
      trigger: { type: "time", at: "07:30" },
      action: { type: "command", deviceId: state.deviceId, command: { action: "set", power: true } },
    });
    const evening = await controlPlane.createAutomation({
      name: "Away mode — evening on",
      enabled: true,
      trigger: { type: "time", at: "19:00" },
      action: { type: "command", deviceId: state.deviceId, command: { action: "set", power: true } },
    });
    const night = await controlPlane.createAutomation({
      name: "Away mode — night off",
      enabled: true,
      trigger: { type: "time", at: "23:30" },
      action: { type: "command", deviceId: state.deviceId, command: { action: "set", power: false } },
    });
    const ids = [morning, evening, night].filter((r) => r.ok).map((r) => r.data.automation!.id);
    const next: AwayModeState = { ...state, enabled: true, automationIds: ids };
    saveState(next);
    setState(next);
    setBusy(false);
  };

  const deactivate = async () => {
    setBusy(true);
    await Promise.all(state.automationIds.map((id) => controlPlane.deleteAutomation(id)));
    const next: AwayModeState = { ...state, enabled: false, automationIds: [] };
    saveState(next);
    setState(next);
    setBusy(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><Luggage className="h-6 w-6" /> Vacation / Away mode</h1>
        <p className="text-sm text-slate-400 mt-1">Simulate presence with a real morning/evening/night schedule while you&apos;re away.</p>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="font-bold text-white">Away mode</div>
            <div className="text-xs text-slate-500">{state.enabled ? `Active — ${state.automationIds.length} automations running` : "Inactive"}</div>
          </div>
          <Toggle checked={state.enabled} onChange={(v) => (v ? undefined : deactivate())} label="Away mode" disabled={busy} />
        </div>

        {!state.enabled && (
          <>
            <label className="block text-xs text-slate-400 mb-1">Device to simulate presence with</label>
            <select
              value={state.deviceId || ""}
              onChange={(e) => setState({ ...state, deviceId: e.target.value })}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-4"
            >
              <option value="">Select a device…</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.name || d.id}</option>
              ))}
            </select>
            <button
              onClick={activate}
              disabled={!state.deviceId || busy}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />} Activate away mode
            </button>
          </>
        )}

        {state.enabled && (
          <button onClick={deactivate} disabled={busy} className="rounded-xl px-4 py-2.5 font-semibold text-slate-200 bg-white/5 border border-white/10">
            {busy ? "Stopping…" : "Deactivate & remove automations"}
          </button>
        )}
      </Card>
    </div>
  );
}
