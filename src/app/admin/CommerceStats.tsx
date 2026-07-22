"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { formatINR } from "@/lib/shop-data";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface Stats {
  gmv: number;
  revenue: number;
  orders: number;
  paidOrders: number;
  aov: number;
  customers: number;
  devices: number;
  walletLiability: number;
  statusCounts: Record<string, number>;
  topProducts: { name: string; qty: number; revenue: number }[];
  lowStock: { name: string; stock: number }[];
  openTickets: number;
  pendingReturns: number;
  reviews: number;
}

export default function CommerceStats() {
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/admin/analytics", { headers: { "x-admin-token": tok() } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.success) setS(d.stats);
      })
      .catch(() => {});
  }, []);

  if (!s) return null;

  const cards: { label: string; value: string | number; color?: string }[] = [
    { label: "Revenue (paid)", value: formatINR(s.revenue), color: "#10b981" },
    { label: "GMV (all orders)", value: formatINR(s.gmv) },
    { label: "Orders", value: s.orders },
    { label: "Avg order value", value: formatINR(s.aov) },
    { label: "Customers", value: s.customers },
    { label: "Wallet liability", value: formatINR(s.walletLiability), color: "#f59e0b" },
    { label: "Open tickets", value: s.openTickets, color: s.openTickets ? "#f59e0b" : undefined },
    { label: "Pending returns", value: s.pendingReturns, color: s.pendingReturns ? "#f59e0b" : undefined },
  ];

  const card = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };

  return (
    <div className="mb-10">
      <h2 className="mb-4 text-lg font-bold" style={{ color: "var(--text-primary)" }}>
        Commerce overview
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl p-4" style={card}>
            <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              {c.label}
            </p>
            <p className="mt-1 text-2xl font-bold" style={{ color: c.color || "var(--text-primary)" }}>
              {typeof c.value === "number" ? c.value.toLocaleString("en-IN") : c.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl p-5" style={card}>
          <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            <TrendingUp className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> Top products
          </h3>
          {s.topProducts.length === 0 ? (
            <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>No sales yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {s.topProducts.map((p) => (
                <li key={p.name} className="flex justify-between text-sm">
                  <span style={{ color: "var(--text-secondary)" }}>{p.name} · {p.qty} sold</span>
                  <span style={{ color: "var(--text-primary)" }}>{formatINR(p.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-2xl p-5" style={card}>
          <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            <AlertTriangle className="h-4 w-4" style={{ color: "#f59e0b" }} /> Low stock
          </h3>
          {s.lowStock.length === 0 ? (
            <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>All products well stocked.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {s.lowStock.map((p) => (
                <li key={p.name} className="flex justify-between text-sm">
                  <span style={{ color: "var(--text-secondary)" }}>{p.name}</span>
                  <span style={{ color: p.stock === 0 ? "#ef4444" : "#f59e0b" }}>{p.stock} left</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
