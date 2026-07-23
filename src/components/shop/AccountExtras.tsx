"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Gift, User, MapPin, Plus, Trash2, Save, Star } from "lucide-react";
import { formatINR } from "@/lib/shop-data";

type Headers = () => Record<string, string>;

export default function AccountExtras({ authHeaders, onWalletChange }: { authHeaders: Headers; onWalletChange?: () => void }) {
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <LoyaltyCard authHeaders={authHeaders} onWalletChange={onWalletChange} />
      <ProfileCard authHeaders={authHeaders} />
      <div className="lg:col-span-2">
        <AddressBook authHeaders={authHeaders} />
      </div>
    </div>
  );
}

const card = { background: "var(--bg-surface)", borderColor: "var(--border-primary)" };
const field = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

// ------------------------------------------------------------- loyalty ----
function LoyaltyCard({ authHeaders, onWalletChange }: { authHeaders: Headers; onWalletChange?: () => void }) {
  const [points, setPoints] = useState(0);
  const [redeem, setRedeem] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/loyalty", { headers: authHeaders() });
      if (r.ok) setPoints((await r.json()).points || 0);
    } catch {
      /* ignore */
    }
  }, [authHeaders]);

  useEffect(() => {
    load();
  }, [load]);

  const doRedeem = async () => {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/loyalty", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ points: Number(redeem) || 0 }),
      });
      const d = await r.json();
      if (d.success) {
        setMsg(`Redeemed! Wallet is now ${formatINR(d.wallet)}.`);
        setRedeem("");
        load();
        onWalletChange?.();
      } else setMsg(d.message || "Could not redeem.");
    } catch {
      setMsg("Network error.");
    }
    setBusy(false);
  };

  return (
    <div className="overflow-hidden rounded-2xl border" style={card}>
      <div className="p-6" style={{ background: "linear-gradient(135deg,#f59e0b,#ef4444)" }}>
        <div className="flex items-center gap-2 text-white/90">
          <Gift className="h-4 w-4" /> <span className="text-xs font-semibold uppercase tracking-wider">Circuvent Rewards</span>
        </div>
        <p className="mt-2 flex items-baseline gap-1 text-3xl font-extrabold text-white">
          {points.toLocaleString("en-IN")} <span className="text-sm font-medium text-white/80">points</span>
        </p>
        <p className="mt-1 text-xs text-white/80">Earn 2% back as points on every paid order · 1 point = ₹1.</p>
      </div>
      <div className="p-5">
        <div className="flex gap-2">
          <input
            type="number"
            value={redeem}
            onChange={(e) => setRedeem(e.target.value)}
            placeholder="Points to redeem (min 100)"
            className={field}
            style={inputStyle}
          />
          <button
            onClick={doRedeem}
            disabled={busy || Number(redeem) < 100}
            className="shrink-0 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Redeem"}
          </button>
        </div>
        {msg && <p className="mt-2 text-xs" style={{ color: "var(--accent-cyan)" }}>{msg}</p>}
        <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>Redeems to your Circuvent Wallet as store credit.</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- profile ----
interface Profile {
  name: string;
  phone?: string;
  gender?: string;
  dob?: string;
  gstin?: string;
  businessName?: string;
  notifyPrefs?: { orderUpdates?: boolean; promotions?: boolean; whatsapp?: boolean };
}
function ProfileCard({ authHeaders }: { authHeaders: Headers }) {
  const [p, setP] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/account/profile", { headers: authHeaders() });
      if (r.ok) setP((await r.json()).account);
    } catch {
      /* ignore */
    }
  }, [authHeaders]);
  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!p) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(p),
      });
      const d = await r.json();
      setMsg(d.success ? "Profile saved." : d.message || "Could not save.");
    } catch {
      setMsg("Network error.");
    }
    setBusy(false);
  };

  if (!p) return <div className="rounded-2xl border p-6" style={card}><Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--accent-cyan)" }} /></div>;

  const np = p.notifyPrefs || {};
  const setNp = (k: string, v: boolean) => setP({ ...p, notifyPrefs: { ...np, [k]: v } });

  return (
    <div className="rounded-2xl border p-6" style={card}>
      <h2 className="flex items-center gap-2 font-semibold" style={{ color: "var(--text-primary)" }}>
        <User className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> Profile
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <input className={field} style={inputStyle} placeholder="Name" value={p.name || ""} onChange={(e) => setP({ ...p, name: e.target.value })} />
        <input className={field} style={inputStyle} placeholder="Phone" value={p.phone || ""} onChange={(e) => setP({ ...p, phone: e.target.value })} />
        <input className={field} style={inputStyle} placeholder="Gender" value={p.gender || ""} onChange={(e) => setP({ ...p, gender: e.target.value })} />
        <input className={field} style={inputStyle} placeholder="DOB (YYYY-MM-DD)" value={p.dob || ""} onChange={(e) => setP({ ...p, dob: e.target.value })} />
        <input className={field} style={inputStyle} placeholder="GSTIN (for business invoices)" value={p.gstin || ""} onChange={(e) => setP({ ...p, gstin: e.target.value })} />
        <input className={field} style={inputStyle} placeholder="Business name" value={p.businessName || ""} onChange={(e) => setP({ ...p, businessName: e.target.value })} />
      </div>
      <div className="mt-3 space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Notifications</p>
        {([["orderUpdates", "Order updates"], ["promotions", "Promotions & offers"], ["whatsapp", "WhatsApp alerts"]] as const).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            <input type="checkbox" className="accent-cyan-500" checked={!!np[k as keyof typeof np]} onChange={(e) => setNp(k, e.target.checked)} /> {label}
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={save} disabled={busy} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
        </button>
        {msg && <span className="text-xs" style={{ color: "var(--accent-cyan)" }}>{msg}</span>}
      </div>
    </div>
  );
}

// ----------------------------------------------------------- addresses ----
interface Addr {
  id: string;
  label: string;
  name: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  isDefaultShipping?: boolean;
}
function AddressBook({ authHeaders }: { authHeaders: Headers }) {
  const [list, setList] = useState<Addr[]>([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ label: "Home", name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/account/addresses", { headers: authHeaders() });
      if (r.ok) setList((await r.json()).addresses || []);
    } catch {
      /* ignore */
    }
  }, [authHeaders]);
  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!f.line1 || !f.pincode) return;
    setBusy(true);
    await fetch("/api/account/addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(f),
    });
    setF({ label: "Home", name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "" });
    setOpen(false);
    setBusy(false);
    load();
  };
  const del = async (id: string) => {
    await fetch(`/api/account/addresses?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders() });
    load();
  };
  const makeDefault = async (id: string) => {
    await fetch("/api/account/addresses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ id, isDefaultShipping: true }),
    });
    load();
  };

  return (
    <div className="rounded-2xl border p-6" style={card}>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold" style={{ color: "var(--text-primary)" }}>
          <MapPin className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> Address book
        </h2>
        <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-sm font-medium" style={{ color: "var(--accent-cyan)" }}>
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>

      {open && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <input className={field} style={inputStyle} placeholder="Label (Home/Work)" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
          <input className={field} style={inputStyle} placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input className={field} style={inputStyle} placeholder="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <input className={field} style={inputStyle} placeholder="PIN code" value={f.pincode} onChange={(e) => setF({ ...f, pincode: e.target.value })} />
          <input className={field + " col-span-2"} style={inputStyle} placeholder="Address line 1" value={f.line1} onChange={(e) => setF({ ...f, line1: e.target.value })} />
          <input className={field + " col-span-2"} style={inputStyle} placeholder="Address line 2 (optional)" value={f.line2} onChange={(e) => setF({ ...f, line2: e.target.value })} />
          <input className={field} style={inputStyle} placeholder="City" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
          <input className={field} style={inputStyle} placeholder="State" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} />
          <button onClick={add} disabled={busy} className="col-span-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? "Saving…" : "Save address"}
          </button>
        </div>
      )}

      {list.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>No saved addresses yet.</p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {list.map((a) => (
            <div key={a.id} className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border-primary)" }}>
              <div className="flex items-center justify-between">
                <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                  {a.label} {a.isDefaultShipping && <span className="ml-1 text-[10px]" style={{ color: "var(--accent-cyan)" }}>• default</span>}
                </span>
                <button onClick={() => del(a.id)} style={{ color: "#ef4444" }}><Trash2 className="h-4 w-4" /></button>
              </div>
              <p style={{ color: "var(--text-secondary)" }}>{a.name} · {a.phone}</p>
              <p style={{ color: "var(--text-muted)" }}>{[a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(", ")}</p>
              {!a.isDefaultShipping && (
                <button onClick={() => makeDefault(a.id)} className="mt-1 flex items-center gap-1 text-xs" style={{ color: "var(--accent-cyan)" }}>
                  <Star className="h-3 w-3" /> Set as default
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
