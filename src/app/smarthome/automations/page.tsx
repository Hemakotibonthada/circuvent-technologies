"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Loader2, Trash2, Zap, X, Clock, Activity } from "lucide-react";
import {
  controlPlane,
  type Automation,
  type AutomationBody,
  type AutomationTrigger,
  type AutomationAction,
  type Device,
} from "@/lib/control-plane";
import { Toggle, Segmented } from "../ui";

const OP_LABEL: Record<string, string> = {
  "<": "<",
  "<=": "≤",
  ">": ">",
  ">=": "≥",
  "==": "=",
  "!=": "≠",
  truthy: "is on",
  falsy: "is off",
};

const inputCls =
  "w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-[15px] outline-none focus:border-cyan-500/50 placeholder:text-slate-500";

export default function AutomationsPage() {
  const [items, setItems] = useState<Automation[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const deviceName = useCallback(
    (id?: string) => devices.find((d) => d.id === id)?.name || id || "a device",
    [devices]
  );

  const load = useCallback(async () => {
    const [a, d] = await Promise.all([controlPlane.automations(), controlPlane.devices()]);
    if (a.ok) {
      setItems(a.data.automations ?? []);
      setError(null);
    } else {
      setError("Failed to load automations.");
    }
    if (d.ok) setDevices(d.data.devices ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (a: Automation) => {
    setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, enabled: !x.enabled } : x)));
    await controlPlane.updateAutomation(a.id, { enabled: !a.enabled });
  };

  const remove = async (a: Automation) => {
    if (!confirm(`Delete automation "${a.name}"?`)) return;
    setItems((prev) => prev.filter((x) => x.id !== a.id));
    await controlPlane.deleteAutomation(a.id);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Automations</h1>
          <p className="text-slate-400 text-sm mt-1">Rules that run on device events or on a schedule.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}
        >
          <Plus className="h-4 w-4" /> New automation
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-300 text-sm">{error}</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-16 flex flex-col items-center text-center px-6">
          <div className="h-14 w-14 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
            <Zap className="h-7 w-7 text-slate-400" />
          </div>
          <h2 className="text-white font-bold text-lg">No automations yet</h2>
          <p className="text-slate-400 text-sm mt-1 max-w-sm">
            Create a rule — e.g. &ldquo;when the tank drops below 20%, notify me&rdquo; or &ldquo;every day at 06:00,
            start the pump.&rdquo;
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-5 flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}
          >
            <Plus className="h-4 w-4" /> Create automation
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <div
              key={a.id}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {a.trigger.type === "time" ? (
                    <Clock className="h-4 w-4 text-violet-400" />
                  ) : (
                    <Activity className="h-4 w-4 text-cyan-400" />
                  )}
                  <span className="font-bold text-white truncate">{a.name}</span>
                </div>
                <div className="text-slate-400 text-sm mt-1.5">{triggerSummary(a.trigger, deviceName)}</div>
                <div className="text-slate-500 text-sm mt-0.5">→ {actionSummary(a.action, deviceName)}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Toggle checked={a.enabled} onChange={() => toggle(a)} label="Enabled" />
                <button
                  onClick={() => remove(a)}
                  className="h-9 w-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-red-300 hover:bg-red-500/10"
                  aria-label="Delete automation"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <AutomationForm
          devices={devices}
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            setLoading(true);
            load();
          }}
        />
      )}
    </div>
  );
}

function triggerSummary(t: AutomationTrigger, name: (id?: string) => string): string {
  if (t.type === "time") return `Every day at ${t.at ?? "--:--"} IST`;
  const dev = name(t.deviceId);
  if (t.op === "truthy" || t.op === "falsy") return `When ${dev} · ${t.field} ${OP_LABEL[t.op]}`;
  return `When ${dev} · ${t.field} ${OP_LABEL[t.op ?? "=="]} ${t.value}`;
}

function actionSummary(a: AutomationAction, name: (id?: string) => string): string {
  if (a.type === "notify") return `Notify: ${a.title || "alert"}`;
  const keys = a.command ? Object.keys(a.command).join(", ") : "";
  return `Command ${name(a.deviceId)}${keys ? ` (${keys})` : ""}`;
}

function parseValue(raw: string): number | boolean | string {
  const s = raw.trim();
  if (s === "true") return true;
  if (s === "false") return false;
  if (s !== "" && !Number.isNaN(Number(s))) return Number(s);
  return s;
}

function AutomationForm({
  devices,
  onClose,
  onCreated,
}: {
  devices: Device[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<"state" | "time">("state");
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? "");
  const [field, setField] = useState("");
  const [op, setOp] = useState<NonNullable<AutomationTrigger["op"]>>("<");
  const [value, setValue] = useState("");
  const [at, setAt] = useState("06:00");

  const [actionType, setActionType] = useState<"notify" | "command">("notify");
  const [notifyTitle, setNotifyTitle] = useState("");
  const [notifyBody, setNotifyBody] = useState("");
  const [cmdDeviceId, setCmdDeviceId] = useState(devices[0]?.id ?? "");
  const [cmdField, setCmdField] = useState("");
  const [cmdValue, setCmdValue] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsValue = op !== "truthy" && op !== "falsy";
  const deviceOptions = useMemo(() => devices.map((d) => ({ value: d.id, label: d.name || d.id })), [devices]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trigger: AutomationTrigger =
      triggerType === "time"
        ? { type: "time", at }
        : { type: "state", deviceId, field: field.trim(), op, ...(needsValue ? { value: parseValue(value) } : {}) };

    if (triggerType === "state" && (!deviceId || !field.trim())) {
      setError("Pick a device and a field for the trigger.");
      return;
    }
    if (triggerType === "time" && !/^\d{2}:\d{2}$/.test(at)) {
      setError("Enter a valid time as HH:MM.");
      return;
    }

    let action: AutomationAction;
    if (actionType === "notify") {
      if (!notifyTitle.trim()) {
        setError("Enter a notification title.");
        return;
      }
      action = { type: "notify", title: notifyTitle.trim(), body: notifyBody.trim() };
    } else {
      if (!cmdDeviceId || !cmdField.trim()) {
        setError("Pick a device and a command field.");
        return;
      }
      action = { type: "command", deviceId: cmdDeviceId, command: { action: "set", [cmdField.trim()]: parseValue(cmdValue) } };
    }

    const body: AutomationBody = { name: name.trim() || "Automation", enabled: true, trigger, action };
    setBusy(true);
    const r = await controlPlane.createAutomation(body);
    setBusy(false);
    if (r.ok && r.data?.automation) onCreated();
    else setError("Could not create the automation. Check your inputs.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0f1629] p-6 my-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-lg">New automation</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Name</Label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Low tank alert" />
          </div>

          <div>
            <Label>Trigger</Label>
            <Segmented
              value={triggerType}
              onChange={setTriggerType}
              options={[
                { value: "state", label: "Device event" },
                { value: "time", label: "Time of day" },
              ]}
            />
          </div>

          {triggerType === "state" ? (
            <div className="space-y-3 rounded-xl border border-white/5 bg-black/20 p-4">
              <div>
                <Label>Device</Label>
                <select className={inputCls} value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
                  {deviceOptions.length === 0 && <option value="">No devices</option>}
                  {deviceOptions.map((o) => (
                    <option key={o.value} value={o.value} className="bg-[#0f1629]">
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Field</Label>
                  <input className={inputCls} value={field} onChange={(e) => setField(e.target.value)} placeholder="level" />
                </div>
                <div>
                  <Label>Condition</Label>
                  <select
                    className={inputCls}
                    value={op}
                    onChange={(e) => setOp(e.target.value as NonNullable<AutomationTrigger["op"]>)}
                  >
                    <option value="<" className="bg-[#0f1629]">less than</option>
                    <option value="<=" className="bg-[#0f1629]">≤</option>
                    <option value=">" className="bg-[#0f1629]">greater than</option>
                    <option value=">=" className="bg-[#0f1629]">≥</option>
                    <option value="==" className="bg-[#0f1629]">equals</option>
                    <option value="!=" className="bg-[#0f1629]">not equal</option>
                    <option value="truthy" className="bg-[#0f1629]">is on / true</option>
                    <option value="falsy" className="bg-[#0f1629]">is off / false</option>
                  </select>
                </div>
              </div>
              {needsValue && (
                <div>
                  <Label>Value</Label>
                  <input className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} placeholder="20" />
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-white/5 bg-black/20 p-4">
              <Label>Time (IST)</Label>
              <input className={inputCls} type="time" value={at} onChange={(e) => setAt(e.target.value)} />
            </div>
          )}

          <div>
            <Label>Action</Label>
            <Segmented
              value={actionType}
              onChange={setActionType}
              options={[
                { value: "notify", label: "Notify me" },
                { value: "command", label: "Control a device" },
              ]}
            />
          </div>

          {actionType === "notify" ? (
            <div className="space-y-3 rounded-xl border border-white/5 bg-black/20 p-4">
              <div>
                <Label>Title</Label>
                <input className={inputCls} value={notifyTitle} onChange={(e) => setNotifyTitle(e.target.value)} placeholder="Low tank" />
              </div>
              <div>
                <Label>Message</Label>
                <input className={inputCls} value={notifyBody} onChange={(e) => setNotifyBody(e.target.value)} placeholder="Tank dropped below 20%." />
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-white/5 bg-black/20 p-4">
              <div>
                <Label>Device</Label>
                <select className={inputCls} value={cmdDeviceId} onChange={(e) => setCmdDeviceId(e.target.value)}>
                  {deviceOptions.length === 0 && <option value="">No devices</option>}
                  {deviceOptions.map((o) => (
                    <option key={o.value} value={o.value} className="bg-[#0f1629]">
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Command field</Label>
                  <input className={inputCls} value={cmdField} onChange={(e) => setCmdField(e.target.value)} placeholder="pump" />
                </div>
                <div>
                  <Label>Value</Label>
                  <input className={inputCls} value={cmdValue} onChange={(e) => setCmdValue(e.target.value)} placeholder="true" />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl py-3 font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create automation
          </button>
        </form>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-slate-400 mb-1.5 block">{children}</span>;
}
