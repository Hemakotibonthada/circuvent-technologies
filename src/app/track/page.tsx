"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, CheckCircle2, Circle, Package, Truck, Loader2, ExternalLink, ChevronRight, LogIn } from "lucide-react";
import { formatINR } from "@/lib/shop-data";
import { useAccount } from "@/components/shop/AccountProvider";

interface TrackedOrder {
  orderNo: string;
  placedAt: string;
  items: { name: string; qty: number; lineTotal: number }[];
  total: number;
  status: string;
  trackingNumber?: string | null;
  carrier?: string | null;
  paymentMethod?: string;
  paymentStatus?: string;
  history?: { status: string; at: string; note?: string }[];
  customer: { email?: string };
}

const STEPS: [string, string][] = [
  ["placed", "Placed"],
  ["confirmed", "Confirmed"],
  ["packed", "Packed"],
  ["shipped", "Shipped"],
  ["out_for_delivery", "Out for delivery"],
  ["delivered", "Delivered"],
];

const STATUS_LABEL: Record<string, string> = {
  ...Object.fromEntries(STEPS),
  cancelled: "Cancelled",
};

function loadOrders(): TrackedOrder[] {
  try {
    return JSON.parse(localStorage.getItem("circuvent-orders") || "[]");
  } catch {
    return [];
  }
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/** Best-effort deep link to a courier's own tracking page for common Indian carriers. */
function courierTrackUrl(carrier?: string | null, awb?: string | null): string | null {
  if (!awb) return null;
  const c = (carrier || "").toLowerCase();
  const a = encodeURIComponent(awb);
  if (c.includes("delhivery")) return `https://www.delhivery.com/track/package/${a}`;
  if (c.includes("blue")) return `https://www.bluedart.com/tracking?trackFor=0&trackNo=${a}`;
  if (c.includes("dtdc")) return `https://www.dtdc.in/tracking/tracking.asp?strCnno=${a}`;
  if (c.includes("xpress")) return `https://www.xpressbees.com/track?awb=${a}`;
  if (c.includes("ecom")) return `https://ecomexpress.in/tracking/?awb_field=${a}`;
  if (c.includes("ekart")) return `https://ekartlogistics.com/shipmenttrack/${a}`;
  if (c.includes("post")) return `https://www.indiapost.gov.in/`;
  if (c.includes("ship")) return `https://www.shiprocket.in/shipment-tracking/${a}`;
  return `https://www.google.com/search?q=${encodeURIComponent((carrier || "courier") + " tracking " + awb)}`;
}

export default function TrackPage() {
  const { account, ready, authHeaders } = useAccount();
  const [orderNo, setOrderNo] = useState("");
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [myOrders, setMyOrders] = useState<TrackedOrder[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  const doLookup = async (no: string, em: string) => {
    setErr("");
    setOrder(null);
    setLoading(true);
    // 1) Server (cross-device) lookup
    try {
      const res = await fetch(
        `/api/orders/track?order=${encodeURIComponent(no.trim())}&email=${encodeURIComponent(em.trim())}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.order) {
          setOrder(data.order);
          setLoading(false);
          return;
        }
      }
    } catch {
      /* fall through to device-local */
    }
    // 2) Fallback: orders saved on this device
    const found = loadOrders().find(
      (o) =>
        o.orderNo?.toLowerCase() === no.trim().toLowerCase() &&
        o.customer?.email?.toLowerCase() === em.trim().toLowerCase()
    );
    if (found) setOrder(found);
    else
      setErr(
        "No order found for that number and email. If you placed it on another device, use the tracking link in your confirmation email."
      );
    setLoading(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (orderNo && email) doLookup(orderNo, email);
  };

  // Track one of the signed-in customer's own orders (no need to type anything).
  const trackMine = (o: TrackedOrder) => {
    const em = o.customer?.email || account?.email || "";
    setOrderNo(o.orderNo);
    setEmail(em);
    doLookup(o.orderNo, em);
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  };

  // Load the signed-in customer's order history so they can track without typing.
  useEffect(() => {
    if (!ready || !account) {
      setMyOrders([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingMine(true);
      try {
        const res = await fetch("/api/account/orders", { headers: authHeaders() });
        if (res.ok) {
          const d = await res.json();
          if (!cancelled) setMyOrders(d.orders || []);
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) setLoadingMine(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, account, authHeaders]);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const o = sp.get("order") || "";
    const em = sp.get("email") || "";
    if (o) setOrderNo(o);
    if (em) setEmail(em);
    if (o && em) doLookup(o, em);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelled = order?.status === "cancelled";
  const currentIdx = order ? Math.max(0, STEPS.findIndex((s) => s[0] === order.status)) : 0;
  const inputStyle = { background: "var(--bg-surface)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

  return (
    <section className="relative z-10 mx-auto max-w-3xl px-6 pb-24 pt-28 lg:px-8 lg:pt-32">
      <div className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan)" }}>
          Order tracking
        </p>
        <h1 className="text-3xl font-bold sm:text-4xl" style={{ color: "var(--text-primary)" }}>
          Track your{" "}
          <span className="bg-gradient-to-r from-cyan-500 via-violet-500 to-pink-500 bg-clip-text text-transparent">order</span>
        </h1>
        <p className="mt-2 text-sm sm:text-base" style={{ color: "var(--text-tertiary)" }}>
          Enter your order number and the email you used at checkout to see live status.
        </p>
      </div>

      {/* Signed-in customers: their orders, one tap to track (no typing needed). */}
      {ready && account && (
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold" style={{ color: "var(--text-primary)" }}>
              <Package className="h-5 w-5" style={{ color: "var(--accent-cyan)" }} /> Your orders
            </h2>
            <Link href="/shop/account" className="text-xs font-semibold" style={{ color: "var(--accent-cyan)" }}>
              Manage in account →
            </Link>
          </div>

          {loadingMine ? (
            <div
              className="flex justify-center rounded-2xl border py-12"
              style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
            >
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--accent-cyan)" }} />
            </div>
          ) : myOrders.length === 0 ? (
            <div
              className="rounded-2xl border p-6 text-center text-sm"
              style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)", color: "var(--text-tertiary)" }}
            >
              You haven&apos;t placed any orders yet.{" "}
              <Link href="/shop" className="font-semibold" style={{ color: "var(--accent-cyan)" }}>
                Start shopping →
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {myOrders.map((o) => {
                const active = order?.orderNo === o.orderNo;
                return (
                  <li key={o.orderNo}>
                    <button
                      onClick={() => trackMine(o)}
                      className="group flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors hover:border-[var(--border-accent)]"
                      style={{ background: "var(--bg-surface)", borderColor: active ? "var(--border-accent)" : "var(--border-primary)" }}
                    >
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: "var(--accent-cyan-muted)" }}>
                        <Package className="h-5 w-5" style={{ color: "var(--accent-cyan)" }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                            {o.orderNo}
                          </span>
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={{ background: "var(--accent-cyan-muted)", color: "var(--accent-cyan)" }}
                          >
                            {STATUS_LABEL[o.status] || o.status}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs" style={{ color: "var(--text-muted)" }}>
                          {fmt(o.placedAt)} · {o.items.reduce((s, it) => s + it.qty, 0)} item(s) · {formatINR(o.total)}
                        </p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold" style={{ color: "var(--accent-cyan)" }}>
                        Track <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Guests: nudge to sign in for one-tap tracking. */}
      {ready && !account && (
        <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
          <Link href="/shop/account" className="inline-flex items-center gap-1 font-semibold" style={{ color: "var(--accent-cyan)" }}>
            <LogIn className="h-3.5 w-3.5" /> Sign in
          </Link>{" "}
          to see all your orders and track them in one tap.
        </p>
      )}

      {ready && account && (
        <p className="mb-2 text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
          Track another order
        </p>
      )}
      <form
        onSubmit={submit}
        className="flex flex-col gap-3 rounded-2xl border p-5 sm:flex-row"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
      >
          <input
            className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
            style={inputStyle}
            placeholder="Order number (e.g. CV-20260722-ABCDE)"
            value={orderNo}
            onChange={(e) => setOrderNo(e.target.value)}
          />
          <input
            className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
            style={inputStyle}
            placeholder="Email used at checkout"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Track
          </button>
        </form>

        {err && (
          <p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{err}</p>
        )}

        {order && (
          <div className="mt-8" ref={detailRef}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                  {order.orderNo}
                </h2>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Placed {fmt(order.placedAt)} · Status:{" "}
                  <span style={{ color: "var(--accent-cyan)" }}>
                    {STATUS_LABEL[order.status] || order.status}
                  </span>
                </p>
              </div>
              <span className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>
                {formatINR(order.total)}
              </span>
            </div>

            {(order.trackingNumber || order.carrier) && (
              <div
                className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
                style={{ background: "var(--accent-cyan-muted)", borderColor: "var(--border-accent)" }}
              >
                <div className="flex items-center gap-3">
                  <Truck className="h-5 w-5" style={{ color: "var(--accent-cyan)" }} />
                  <div className="text-sm">
                    <span style={{ color: "var(--text-secondary)" }}>Shipment: </span>
                    <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                      {order.carrier || "Courier"}
                    </span>
                    {order.trackingNumber && (
                      <span style={{ color: "var(--text-secondary)" }}>
                        {" "}· AWB <span className="font-mono">{order.trackingNumber}</span>
                      </span>
                    )}
                  </div>
                </div>
                {courierTrackUrl(order.carrier, order.trackingNumber) && (
                  <a
                    href={courierTrackUrl(order.carrier, order.trackingNumber)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold"
                    style={{ borderColor: "var(--border-accent)", color: "var(--accent-cyan)", background: "var(--bg-surface)" }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Track on courier
                  </a>
                )}
              </div>
            )}

            {cancelled ? (
              <div
                className="mt-6 rounded-2xl border p-6 text-sm"
                style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
              >
                This order was cancelled. If this is unexpected, reply to your confirmation email and we&apos;ll help.
              </div>
            ) : (
              <div
                className="mt-6 rounded-2xl border p-6"
                style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
              >
                <ol className="relative ml-3 border-l" style={{ borderColor: "var(--border-primary)" }}>
                  {STEPS.map(([key, label], i) => {
                    const reached = i <= currentIdx;
                    return (
                      <li key={key} className="mb-6 ml-6 last:mb-0">
                        <span
                          className="absolute -left-3 grid h-6 w-6 place-items-center rounded-full"
                          style={{ background: "var(--bg-surface)" }}
                        >
                          {reached ? (
                            <CheckCircle2 className="h-[22px] w-[22px]" style={{ color: "var(--accent-cyan)" }} />
                          ) : (
                            <Circle className="h-5 w-5" style={{ color: "var(--text-muted)" }} />
                          )}
                        </span>
                        <p
                          className="font-medium"
                          style={{ color: reached ? "var(--text-primary)" : "var(--text-muted)" }}
                        >
                          {label}
                        </p>
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  We&apos;ll email you as your order moves through each stage.
                </p>
              </div>
            )}

            <div
              className="mt-6 rounded-2xl border p-6"
              style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
            >
              <h3 className="flex items-center gap-2 font-semibold" style={{ color: "var(--text-primary)" }}>
                <Package className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> Items
              </h3>
              <div className="mt-3">
                {order.items.map((it, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between py-2 text-sm"
                    style={{ borderTop: idx ? "1px solid var(--border-primary)" : "none" }}
                  >
                    <span style={{ color: "var(--text-secondary)" }}>
                      {it.name} <span style={{ color: "var(--text-muted)" }}>× {it.qty}</span>
                    </span>
                    <span style={{ color: "var(--text-secondary)" }}>{formatINR(it.lineTotal)}</span>
                  </div>
                ))}
              </div>
            </div>

            {order.history && order.history.length > 0 && (
              <div
                className="mt-6 rounded-2xl border p-6"
                style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
              >
                <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
                  Updates
                </h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {order.history
                    .slice()
                    .reverse()
                    .map((h, idx) => (
                      <li key={idx} className="flex justify-between gap-3">
                        <span style={{ color: "var(--text-secondary)" }}>
                          {STATUS_LABEL[h.status] || h.status}
                          {h.note ? ` — ${h.note}` : ""}
                        </span>
                        <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
                          {fmt(h.at)}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
  );
}
