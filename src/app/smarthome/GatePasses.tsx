"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Plus, Trash2, Copy, Check } from "lucide-react";
import { controlPlane, type GatePass } from "@/lib/control-plane";
import { SectionLabel } from "./ui";

const VALIDITY = [
  { label: "30 minutes", min: 30 },
  { label: "2 hours", min: 120 },
  { label: "8 hours", min: 480 },
  { label: "24 hours", min: 1440 },
  { label: "7 days", min: 10080 },
];
const STATUS_COLOR: Record<string, string> = {
  active: "#22c55e", scheduled: "#38bdf8", expired: "#64748b", used: "#f59e0b", revoked: "#ef4444",
};

export function GatePasses({ deviceId }: { deviceId: string }) {
  const [passes, setPasses] = useState<GatePass[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("Guest");
  const [minutes, setMinutes] = useState(120);
  const [maxUses, setMaxUses] = useState(1);
  const [justCreated, setJustCreated] = useState<GatePass | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await controlPlane.gatePasses(deviceId);
    if (r.ok) setPasses(r.data.passes ?? []);
    setLoading(false);
  }, [deviceId]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setCreating(true);
    const r = await controlPlane.createGatePass({ deviceId, label: label.trim() || "Guest", validToMinutes: minutes, maxUses });
    setCreating(false);
    if (r.ok && r.data?.pass) {
      setJustCreated(r.data.pass);
      await load();
    }
  };

  const revoke = async (id: number) => {
    await controlPlane.revokeGatePass(id);
    load();
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* clipboard blocked */ }
  };

  return (
    <div className="mt-6">
      <SectionLabel>Guest passes</SectionLabel>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <input
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Who is this for? (e.g. Courier)"
            maxLength={80}
          />
          <select className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {VALIDITY.map((v) => <option key={v.min} value={v.min}>{v.label}</option>)}
          </select>
          <select className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))}>
            <option value={1}>Single use</option>
            <option value={3}>3 uses</option>
            <option value={10}>10 uses</option>
            <option value={999}>Unlimited</option>
          </select>
          <button onClick={create} disabled={creating} className="flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create
          </button>
        </div>

        {justCreated && (
          <div className="mt-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-center">
            <div className="text-xs uppercase tracking-wide text-cyan-300">New pass for {justCreated.label}</div>
            <div className="mt-2 font-mono text-4xl font-extrabold tracking-[0.3em] text-white">{justCreated.code}</div>
            <div className="mt-2 text-xs text-slate-400">Valid until {new Date(justCreated.valid_to).toLocaleString("en-IN")} · {justCreated.max_uses === 999 ? "unlimited" : justCreated.max_uses} use(s)</div>
            <div className="mt-3 flex items-center justify-center gap-2">
              <button onClick={() => copy(justCreated.code)} className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/10">
                {copied === justCreated.code ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />} Copy PIN
              </button>
              <button onClick={() => copy(justCreated.qr)} className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/10">
                {copied === justCreated.qr ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />} Copy QR link
              </button>
            </div>
            <div className="mt-2 break-all font-mono text-[10px] text-slate-500">{justCreated.qr}</div>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
        ) : passes.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-slate-500">No guest passes yet.</div>
        ) : (
          passes.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <KeyRound className="h-4 w-4 text-slate-400" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-white">{p.code}</span>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: `${STATUS_COLOR[p.status] ?? "#64748b"}22`, color: STATUS_COLOR[p.status] ?? "#64748b" }}>{p.status}</span>
                </div>
                <div className="text-xs text-slate-400">{p.label} · {p.uses}/{p.max_uses === 999 ? "∞" : p.max_uses} used · until {new Date(p.valid_to).toLocaleString("en-IN")}</div>
              </div>
              <button onClick={() => copy(p.code)} className="rounded-lg border border-white/10 p-1.5 text-slate-300 hover:bg-white/10" aria-label="Copy code">
                {copied === p.code ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
              </button>
              {!p.revoked && p.status !== "expired" && p.status !== "used" && (
                <button onClick={() => revoke(p.id)} className="rounded-lg border border-red-500/30 p-1.5 text-red-300 hover:bg-red-500/10" aria-label="Revoke">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
