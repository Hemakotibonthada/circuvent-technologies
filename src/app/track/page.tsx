"use client";

import { useEffect, useState } from "react";
import { Search, CheckCircle2, Circle, Package } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { formatINR } from "@/lib/shop-data";

interface TrackedOrder {
  orderNo: string;
  placedAt: string;
  items: { name: string; qty: number; lineTotal: number }[];
  total: number;
  status: string;
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

export default function TrackPage() {
  const [orderNo, setOrderNo] = useState("");
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [err, setErr] = useState("");

  const doLookup = (no: string, em: string) => {
    setErr("");
    setOrder(null);
    const found = loadOrders().find(
      (o) =>
        o.orderNo?.toLowerCase() === no.trim().toLowerCase() &&
        o.customer?.email?.toLowerCase() === em.trim().toLowerCase()
    );
    if (found) setOrder(found);
    else
      setErr(
        "No order found on this device for that number and email. Orders are saved on the device used to place them; check your email confirmation too."
      );
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (orderNo && email) doLookup(orderNo, email);
  };

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const o = sp.get("order") || "";
    const em = sp.get("email") || "";
    if (o) setOrderNo(o);
    if (em) setEmail(em);
    if (o && em) doLookup(o, em);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentIdx = order ? Math.max(0, STEPS.findIndex((s) => s[0] === order.status)) : 0;
  const inputStyle = { background: "var(--bg-surface)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

  return (
    <>
      <PageHeader
        eyebrow="Order tracking"
        title="Track your"
        titleHighlight="order"
        description="Enter your order number and the email you used at checkout to see live status."
      />
      <section className="relative z-10 mx-auto max-w-3xl px-6 pb-24 lg:px-8">
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
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-3 text-sm font-semibold text-white"
          >
            <Search className="h-4 w-4" /> Track
          </button>
        </form>

        {err && (
          <p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{err}</p>
        )}

        {order && (
          <div className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                  {order.orderNo}
                </h2>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Placed {fmt(order.placedAt)}
                </p>
              </div>
              <span className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>
                {formatINR(order.total)}
              </span>
            </div>

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
          </div>
        )}
      </section>
    </>
  );
}
