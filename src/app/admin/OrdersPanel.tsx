"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Search, Save, ChevronDown, Download } from "lucide-react";
import { formatINR } from "@/lib/shop-data";

const STATUSES = ["placed", "confirmed", "packed", "shipped", "out_for_delivery", "delivered", "cancelled"];
const LABEL: Record<string, string> = {
  placed: "Placed",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

interface Order {
  orderNo: string;
  placedAt: string;
  items: { name: string; qty: number; lineTotal: number }[];
  total: number;
  status: string;
  trackingNumber?: string;
  carrier?: string;
  paymentMethod: string;
  paymentStatus: string;
  internalNotes?: { at: string; by: string; text: string }[];
  customer: { name?: string; email?: string; phone?: string; address?: string; city?: string; state?: string; pincode?: string };
}

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function OrdersPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [revenue, setRevenue] = useState(0);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openNo, setOpenNo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    try {
      const res = await fetch(`/api/admin/orders?${params.toString()}`, { headers: { "x-admin-token": tok() } });
      if (res.ok) {
        const d = await res.json();
        setOrders(d.orders || []);
        setCounts(d.counts || {});
        setRevenue(d.revenue || 0);
        setTotal(d.total || 0);
      } else {
        setError("Could not load orders. This is a loading failure, not an empty list.");
      }
    } catch {
      setError("Could not load orders. This is a loading failure, not an empty list.");
    } finally {
      setLoading(false);
    }
  }, [status, q]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = async () => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    params.set("format", "csv");
    try {
      const res = await fetch(`/api/admin/orders?${params.toString()}`, { headers: { "x-admin-token": tok() } });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "circuvent-orders.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  };

  const cardStyle = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };

  return (
    <div>
      {/* Summary */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total orders" value={String(total)} />
        <Stat label="Paid revenue" value={formatINR(revenue)} color="#10b981" />
        <Stat label="To ship" value={String((counts.placed || 0) + (counts.confirmed || 0) + (counts.packed || 0))} color="#f59e0b" />
        <Stat label="Delivered" value={String(counts.delivered || 0)} color="#06b6d4" />
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Search order no, name, email, phone…"
            className="w-full rounded-xl border py-2.5 pl-10 pr-3 text-sm outline-none"
            style={{ background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" }}
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border px-3 py-2.5 text-sm outline-none"
          style={{ background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" }}
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {LABEL[s]}
            </option>
          ))}
        </select>
        <button
          onClick={load}
          className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium"
          style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
        <button
          onClick={exportCsv}
          className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium"
          style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--accent-cyan)" }} />
        </div>
      ) : orders.length === 0 && !error ? (
        // Empty-state copy must stay hidden while `error` is set — otherwise a failed fetch looks identical to "no data".
        <p className="py-16 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
          No orders found.
        </p>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <div key={o.orderNo} className="rounded-xl" style={cardStyle}>
              <button
                onClick={() => setOpenNo(openNo === o.orderNo ? null : o.orderNo)}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      {o.orderNo}
                    </span>
                    <StatusBadge status={o.status} />
                  </div>
                  <p className="mt-0.5 truncate text-xs" style={{ color: "var(--text-muted)" }}>
                    {o.customer.name} · {fmt(o.placedAt)} · {o.paymentMethod === "razorpay" ? "Paid online" : o.paymentMethod} ({o.paymentStatus})
                  </p>
                </div>
                <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  {formatINR(o.total)}
                </span>
                <ChevronDown
                  className="h-4 w-4 transition-transform"
                  style={{ color: "var(--text-muted)", transform: openNo === o.orderNo ? "rotate(180deg)" : "none" }}
                />
              </button>
              {openNo === o.orderNo && <OrderEditor order={o} onSaved={load} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OrderEditor({ order, onSaved }: { order: Order; onSaved: () => void }) {
  const [status, setStatus] = useState(order.status);
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber || "");
  const [carrier, setCarrier] = useState(order.carrier || "");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const addInternalNote = async () => {
    if (!internalNote.trim()) return;
    setSavingNote(true);
    try {
      await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-token": tok() },
        body: JSON.stringify({ orderNo: order.orderNo, internalNote }),
      });
      setInternalNote("");
      onSaved();
    } catch {
      /* ignore */
    }
    setSavingNote(false);
  };

  const save = async () => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-token": tok() },
        body: JSON.stringify({ orderNo: order.orderNo, status, trackingNumber, carrier, note, notify }),
      });
      const d = await res.json();
      if (d.success) {
        setMsg("Saved" + (notify ? " · customer emailed" : ""));
        onSaved();
      } else {
        setMsg(d.message || "Could not save.");
      }
    } catch {
      setMsg("Network error.");
    }
    setBusy(false);
  };

  const inp = "w-full rounded-lg border px-3 py-2 text-sm outline-none";
  const inpStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };
  const lbl = "mb-1 block text-xs font-medium uppercase tracking-wider";

  return (
    <div className="border-t p-4" style={{ borderColor: "var(--border-primary)" }}>
      <div className="mb-3 flex flex-wrap gap-4 text-xs">
        <a
          href={`/shop/invoice/${encodeURIComponent(order.orderNo)}?email=${encodeURIComponent(order.customer.email || "")}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--accent-cyan)" }}
        >
          Invoice ↗
        </a>
        <a
          href={`/shop/invoice/${encodeURIComponent(order.orderNo)}?email=${encodeURIComponent(order.customer.email || "")}&type=packing`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--accent-cyan)" }}
        >
          Packing slip ↗
        </a>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
          <p className="mb-1 font-semibold" style={{ color: "var(--text-primary)" }}>
            Delivery
          </p>
          <p>{order.customer.name} · {order.customer.phone}</p>
          <p>{order.customer.email}</p>
          <p>
            {[order.customer.address, order.customer.city, order.customer.state, order.customer.pincode].filter(Boolean).join(", ")}
          </p>
          <p className="mt-2 font-semibold" style={{ color: "var(--text-primary)" }}>
            Items
          </p>
          {order.items.map((it, i) => (
            <p key={i}>
              {it.name} × {it.qty} — {formatINR(it.lineTotal)}
            </p>
          ))}

          <p className="mt-3 font-semibold" style={{ color: "var(--text-primary)" }}>
            Staff notes (internal)
          </p>
          {(order.internalNotes || []).length === 0 ? (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>No internal notes yet.</p>
          ) : (
            (order.internalNotes || []).map((n, i) => (
              <p key={i} className="text-xs" style={{ color: "var(--text-muted)" }}>
                {fmt(n.at)} · {n.by}: {n.text}
              </p>
            ))
          )}
          <div className="mt-2 flex gap-2">
            <input
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addInternalNote()}
              placeholder="Add a private note (not emailed)"
              className={inp}
              style={inpStyle}
            />
            <button
              onClick={addInternalNote}
              disabled={savingNote}
              className="shrink-0 rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-60"
              style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
            >
              {savingNote ? "…" : "Add"}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className={lbl} style={{ color: "var(--text-tertiary)" }}>
              Status
            </label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inp} style={inpStyle}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl} style={{ color: "var(--text-tertiary)" }}>
                Carrier
              </label>
              <input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Delhivery, BlueDart…" className={inp} style={inpStyle} />
            </div>
            <div>
              <label className={lbl} style={{ color: "var(--text-tertiary)" }}>
                Tracking / AWB
              </label>
              <input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} className={inp} style={inpStyle} />
            </div>
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--text-tertiary)" }}>
              Note (optional)
            </label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Dispatched from Rajahmundry hub" className={inp} style={inpStyle} />
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="accent-cyan-500" />
            Email the customer about this update
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={busy}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save & update
            </button>
            {msg && <span className="text-xs" style={{ color: "var(--accent-cyan)" }}>{msg}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color = "var(--text-primary)" }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)" }}>
      <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    placed: "#f59e0b",
    confirmed: "#f59e0b",
    packed: "#8b5cf6",
    shipped: "#06b6d4",
    out_for_delivery: "#06b6d4",
    delivered: "#10b981",
    cancelled: "#ef4444",
  };
  const c = tone[status] || "#94a3b8";
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `${c}22`, color: c }}>
      {LABEL[status] || status}
    </span>
  );
}
