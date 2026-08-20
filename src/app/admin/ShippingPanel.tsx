"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MapPinned, Plus, Trash2, Truck, X } from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface ShippingZone { id: string; name: string; pincodePrefixes: string[]; ratePerOrder: number; freeShippingThreshold: number; etaDays: number; active: boolean }

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };
const field = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

export default function ShippingPanel() {
  const [zones, setZones] = useState<ShippingZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Partial<ShippingZone> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/shipping", { headers: { "x-admin-token": tok() } });
      if (res.ok) {
        setZones((await res.json()).zones || []);
      } else {
        setError("Could not load shipping zones. This is a loading failure, not an empty list.");
      }
    } catch {
      setError("Could not load shipping zones. This is a loading failure, not an empty list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form?.name) return;
    await fetch("/api/admin/shipping", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ ...form, pincodePrefixes: (form.pincodePrefixes as unknown as string)?.toString().split(",").map((s) => s.trim()).filter(Boolean) }),
    });
    setForm(null);
    load();
  };

  const remove = async (id: string) => {
    const z = zones.find((x) => x.id === id);
    if (!confirm(`Delete the "${z?.name ?? "this"}" shipping zone? Checkout shipping costs for that area will change immediately.`)) return;
    await fetch(`/api/admin/shipping?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { "x-admin-token": tok() } });
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}><Truck className="w-5 h-5" /> Shipping Zones & Rates</h2>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Pincode-prefix based shipping rates, free-shipping thresholds and ETAs.</p>
        </div>
        <button onClick={() => setForm({ ratePerOrder: 60, freeShippingThreshold: 999, etaDays: 5, active: true })} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}><Plus className="w-4 h-4" /> New zone</button>
      </div>

      {error && (
        <div role="alert" className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--accent-cyan)" }} /></div>
      ) : (
        <div className="space-y-3">
          {zones.map((z) => (
            <div key={z.id} className="rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap" style={card}>
              <div className="flex items-center gap-3">
                <MapPinned className="w-5 h-5" style={{ color: "var(--accent-cyan)" }} />
                <div>
                  <div className="font-medium" style={{ color: "var(--text-primary)" }}>{z.name}</div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Prefixes: {z.pincodePrefixes.join(", ")} · ₹{z.ratePerOrder} · free over ₹{z.freeShippingThreshold} · {z.etaDays}d ETA</div>
                </div>
              </div>
              <button onClick={() => remove(z.id)} aria-label={`Delete ${z.name}`} className="p-1.5 rounded-lg hover:bg-white/10 text-red-400"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          {zones.length === 0 && !error && <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No shipping zones yet — default flat rate applies.</p>}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl p-6" style={card}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-bold" style={{ color: "var(--text-primary)" }}>New shipping zone</h3><button onClick={() => setForm(null)}><X className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} /></button></div>
            <div className="space-y-3">
              <input className={field} style={inputStyle} placeholder="Zone name" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className={field} style={inputStyle} placeholder="Pincode prefixes, comma separated (e.g. 560,561)" onChange={(e) => setForm({ ...form, pincodePrefixes: e.target.value as unknown as string[] })} />
              <div className="grid grid-cols-3 gap-2">
                <input type="number" className={field} style={inputStyle} placeholder="Rate ₹" value={form.ratePerOrder ?? ""} onChange={(e) => setForm({ ...form, ratePerOrder: Number(e.target.value) })} />
                <input type="number" className={field} style={inputStyle} placeholder="Free over ₹" value={form.freeShippingThreshold ?? ""} onChange={(e) => setForm({ ...form, freeShippingThreshold: Number(e.target.value) })} />
                <input type="number" className={field} style={inputStyle} placeholder="ETA days" value={form.etaDays ?? ""} onChange={(e) => setForm({ ...form, etaDays: Number(e.target.value) })} />
              </div>
              <button onClick={save} className="w-full py-2.5 rounded-xl font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>Save zone</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
