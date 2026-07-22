"use client";

import { useState } from "react";
import { Truck, ShieldCheck, Wallet, MapPin } from "lucide-react";
import { products, shopCategories, formatINR, SHIPPING } from "@/lib/shop-data";
import ProductCard from "./ProductCard";

const BENEFITS = [
  { icon: Truck, title: "Free shipping", sub: `Over ${formatINR(SHIPPING.freeOver)}` },
  { icon: ShieldCheck, title: "6-month warranty", sub: "On every device" },
  { icon: Wallet, title: "Cash on delivery", sub: "Pay on arrival" },
  { icon: MapPin, title: "Made in India", sub: "By our R&D lab" },
];

export default function ShopGrid() {
  const [cat, setCat] = useState("All");
  const cats = shopCategories();
  const shown = cat === "All" ? products : products.filter((p) => p.category === cat);

  return (
    <div>
      {/* Benefits */}
      <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {BENEFITS.map((b) => (
          <div
            key={b.title}
            className="flex items-center gap-3 rounded-xl border p-4"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
          >
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg"
              style={{ background: "var(--accent-cyan-muted)", color: "var(--accent-cyan)" }}
            >
              <b.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {b.title}
              </p>
              <p className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                {b.sub}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Category filter */}
      <div className="mb-8 flex flex-wrap gap-2">
        {cats.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors"
            style={
              cat === c
                ? { borderColor: "var(--accent-cyan)", color: "var(--accent-cyan)", background: "var(--accent-cyan-muted)" }
                : { borderColor: "var(--border-primary)", color: "var(--text-tertiary)" }
            }
          >
            {c}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((p, i) => (
          <ProductCard key={p.id} product={p} index={i} />
        ))}
      </div>
    </div>
  );
}
