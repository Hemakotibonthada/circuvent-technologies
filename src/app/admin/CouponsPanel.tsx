"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface Coupon {
  code: string;
  type: "percent" | "flat" | "shipping";
  value: number;
  minSubtotal?: number;
  label: string;
  active: boolean;
}

export default function CouponsPanel() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ code: "", type: "percent", value: "", minSubtotal: "", label: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/coupons", { headers: { "x-admin-token": tok() } });
      if (res.ok) {
        const d = await res.json();
        setCoupons(d.coupons || []);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!form.code.trim()) {
      setMsg("Code is required.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": tok() },
        body: JSON.stringify({
          code: form.code,
          type: form.type,
          value: Number(form.value) || 0,
          minSubtotal: form.minSubtotal ? Number(form.minSubtotal) : undefined,
          label: form.label || form.code,
          active: true,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setForm({ code: "", type: "percent", value: "", minSubtotal: "", label: "" });
        load();
      } else setMsg(d.message || "Could not save.");
    } catch {
      setMsg("Network error.");
    }
    setBusy(false);
  };

  const toggle = async (c: Coupon) => {
    await fetch("/api/admin/coupons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ code: c.code, active: !c.active }),
    });
    load();
  };

  const del = async (code: string) => {
    if (!confirm(`Delete coupon ${code}?`)) return;
    await fetch(`/api/admin/coupons?code=${encodeURIComponent(code)}`, { method: "DELETE", headers: { "x-admin-token": tok() } });
    load();
  };

  const inp = "rounded-lg border px-3 py-2 text-sm outline-none";
  const inpStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };
  const desc = (c: Coupon) =>
    c.type === "percent" ? `${c.value}% off` : c.type === "flat" ? `₹${c.value} off` : "Free shipping";

  return (
    <div>
      {/* Create */}
      <div className="rounded-xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)" }}>
        <div className="grid gap-2 sm:grid-cols-5">
          <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="CODE" className={inp} style={inpStyle} />
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inp} style={inpStyle}>
            <option value="percent">% off</option>
            <option value="flat">₹ off</option>
            <option value="shipping">Free shipping</option>
          </select>
          <input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder={form.type === "percent" ? "% value" : "₹ value"} type="number" className={inp} style={inpStyle} disabled={form.type === "shipping"} />
          <input value={form.minSubtotal} onChange={(e) => setForm({ ...form, minSubtotal: e.target.value })} placeholder="Min ₹ (optional)" type="number" className={inp} style={inpStyle} />
          <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Label" className={inp} style={inpStyle} />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={create} disabled={busy} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save coupon
          </button>
          {msg && <span className="text-xs text-rose-500">{msg}</span>}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--accent-cyan)" }} /></div>
      ) : (
        <div className="mt-4 space-y-2">
          {coupons.map((c) => (
            <div key={c.code} className="flex flex-wrap items-center gap-3 rounded-xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)" }}>
              <span className="font-mono text-sm font-bold" style={{ color: "var(--text-primary)" }}>{c.code}</span>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{desc(c)}{c.minSubtotal ? ` · min ₹${c.minSubtotal}` : ""} · {c.label}</span>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => toggle(c)} className="flex items-center gap-1 text-xs font-medium" style={{ color: c.active ? "#10b981" : "var(--text-muted)" }}>
                  {c.active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />} {c.active ? "Active" : "Off"}
                </button>
                <button onClick={() => del(c.code)} className="rounded-lg border p-1.5" style={{ borderColor: "var(--border-primary)", color: "#ef4444" }}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
