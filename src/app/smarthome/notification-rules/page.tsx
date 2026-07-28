"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, Loader2, Plus, Trash2, X } from "lucide-react";
import { controlPlane, type Device } from "@/lib/control-plane";
import { listRules, upsertRule, toggleRule, deleteRule, matches, type CompareOp, type NotifyRule } from "@/lib/smarthome-notification-rules";
import { useConsole } from "../ConsoleProvider";
import { Card, Toggle } from "../ui";

const OPS: { value: CompareOp; label: string }[] = [
  { value: "truthy", label: "is on / true" },
  { value: "falsy", label: "is off / false" },
  { value: "==", label: "equals" },
  { value: "<", label: "is less than" },
  { value: ">", label: "is greater than" },
];

export default function NotificationRulesPage() {
  const { subscribe } = useConsole();
  const [devices, setDevices] = useState<Device[]>([]);
  const [rules, setRules] = useState<NotifyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ name: string; deviceId: string; field: string; op: CompareOp; value: string } | null>(null);
  const lastMatch = useRef(new Map<string, boolean>());

  const load = useCallback(async () => {
    const r = await controlPlane.devices();
    if (r.ok) setDevices(r.data.devices ?? []);
    setRules(listRules());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return subscribe((u) => {
      if (u.kind !== "state") return;
      const payload = u.payload as Record<string, unknown>;
      for (const rule of rules) {
        if (!rule.enabled) continue;
        if (rule.deviceId && rule.deviceId !== u.deviceId) continue;
        if (!(rule.field in payload)) continue;
        const key = `${rule.id}:${u.deviceId}`;
        const isMatch = matches(rule, payload[rule.field]);
        if (isMatch && !lastMatch.current.get(key)) {
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            try {
              new Notification(rule.name, { body: `${u.deviceId}: ${rule.field} ${rule.op} ${rule.value ?? ""}`.trim() });
            } catch {
              /* ignore */
            }
          }
        }
        lastMatch.current.set(key, isMatch);
      }
    });
  }, [subscribe, rules]);

  const save = () => {
    if (!form?.name || !form.field) return;
    upsertRule({ name: form.name, deviceId: form.deviceId || undefined, field: form.field, op: form.op, value: form.value ? (Number.isNaN(Number(form.value)) ? form.value : Number(form.value)) : undefined });
    setForm(null);
    setRules(listRules());
  };

  const toggle = (r: NotifyRule) => {
    toggleRule(r.id, !r.enabled);
    setRules(listRules());
  };

  const remove = (id: string) => {
    deleteRule(id);
    setRules(listRules());
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><BellRing className="h-6 w-6" /> Notification rules</h1>
          <p className="text-sm text-slate-400 mt-1">Define your own conditions — any device, any field — and get a browser alert the moment they trigger.</p>
        </div>
        <button onClick={() => setForm({ name: "", deviceId: "", field: "power", op: "truthy", value: "" })} className="flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-white" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>
          <Plus className="h-4 w-4" /> New rule
        </button>
      </div>

      <div className="space-y-3">
        {rules.map((r) => (
          <Card key={r.id} className="p-4 flex items-center justify-between gap-4">
            <div>
              <div className="font-bold text-white">{r.name}</div>
              <div className="text-xs text-slate-500">{devices.find((d) => d.id === r.deviceId)?.name || r.deviceId || "any device"} · {r.field} {r.op} {r.value ?? ""}</div>
            </div>
            <div className="flex items-center gap-2">
              <Toggle checked={r.enabled} onChange={() => toggle(r)} />
              <button onClick={() => remove(r.id)} className="text-slate-500 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
            </div>
          </Card>
        ))}
        {rules.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-16 text-center px-6">
            <BellRing className="mx-auto h-8 w-8 text-slate-500" />
            <p className="text-white font-bold mt-3">No custom rules yet</p>
            <p className="text-slate-400 text-sm mt-1">e.g. &ldquo;Alert me if energy-monitor watts &gt; 3000&rdquo;.</p>
          </div>
        )}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0f1629] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold">New rule</h2>
              <button onClick={() => setForm(null)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Rule name" className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-3" />
            <select value={form.deviceId} onChange={(e) => setForm({ ...form, deviceId: e.target.value })} className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-3">
              <option value="">Any device</option>
              {devices.map((d) => <option key={d.id} value={d.id}>{d.name || d.id}</option>)}
            </select>
            <input value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })} placeholder="State field (e.g. watts, motion, level)" className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-3" />
            <select value={form.op} onChange={(e) => setForm({ ...form, op: e.target.value as CompareOp })} className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-3">
              {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {(form.op === "==" || form.op === "<" || form.op === ">") && (
              <input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="Value" className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none mb-3" />
            )}
            <button onClick={save} className="w-full rounded-xl py-2.5 font-semibold text-white" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>Save rule</button>
          </div>
        </div>
      )}
    </div>
  );
}
