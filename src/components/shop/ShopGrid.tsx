"use client";

import { useEffect, useMemo, useState } from "react";
import { Truck, ShieldCheck, Wallet, MapPin, Search, PackageX, Heart } from "lucide-react";
import { products as STATIC, formatINR, SHIPPING, type Product } from "@/lib/shop-data";
import { useWishlist } from "./WishlistProvider";
import ProductCard from "./ProductCard";
import RecentlyViewed from "./RecentlyViewed";

const BENEFITS = [
  { icon: Truck, title: "Free shipping", sub: `Over ${formatINR(SHIPPING.freeOver)}` },
  { icon: ShieldCheck, title: "6-month warranty", sub: "On every device" },
  { icon: Wallet, title: "COD & Wallet", sub: "Flexible payments" },
  { icon: MapPin, title: "Made in India", sub: "By our R&D lab" },
];

const SORTS: { id: string; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "price-asc", label: "Price: Low to High" },
  { id: "price-desc", label: "Price: High to Low" },
  { id: "rating", label: "Top rated" },
  { id: "name", label: "Name (A–Z)" },
];

export default function ShopGrid() {
  const { has, count } = useWishlist();
  const [list, setList] = useState<Product[]>(STATIC);
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("featured");
  const [inStock, setInStock] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [minPrice, setMinPrice] = useState<number | "">("");
  const [maxPrice, setMaxPrice] = useState<number | "">("");

  useEffect(() => {
    let alive = true;
    fetch("/api/shop/products")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.success && Array.isArray(d.products) && d.products.length) {
          setList(d.products as Product[]);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const cats = useMemo(() => ["All", ...Array.from(new Set(list.map((p) => p.category)))], [list]);

  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const lo = minPrice === "" ? -Infinity : Number(minPrice);
    const hi = maxPrice === "" ? Infinity : Number(maxPrice);
    let out = list.filter((p) => {
      const catOk = cat === "All" || p.category === cat;
      const qOk =
        !ql ||
        p.name.toLowerCase().includes(ql) ||
        (p.tagline || "").toLowerCase().includes(ql) ||
        p.category.toLowerCase().includes(ql);
      const stockOk = !inStock || (p.available !== false && (typeof p.stock !== "number" || p.stock > 0));
      const savedOk = !savedOnly || has(p.id);
      const priceOk = p.price >= lo && p.price <= hi;
      return catOk && qOk && stockOk && savedOk && priceOk;
    });
    out = [...out];
    if (sort === "price-asc") out.sort((a, b) => a.price - b.price);
    else if (sort === "price-desc") out.sort((a, b) => b.price - a.price);
    else if (sort === "rating") out.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    else if (sort === "name") out.sort((a, b) => a.name.localeCompare(b.name));
    else out.sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || (b.rating || 0) - (a.rating || 0));
    return out;
  }, [list, cat, q, sort, inStock, savedOnly, minPrice, maxPrice, has]);

  const priceBounds = useMemo(() => {
    if (!list.length) return { min: 0, max: 0 };
    const prices = list.map((p) => p.price);
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [list]);

  const anyFilter = cat !== "All" || !!q || inStock || savedOnly || minPrice !== "" || maxPrice !== "";
  const resetFilters = () => {
    setCat("All");
    setQ("");
    setInStock(false);
    setSavedOnly(false);
    setMinPrice("");
    setMaxPrice("");
    setSort("featured");
  };

  const chip = (active: boolean) =>
    active
      ? { borderColor: "var(--accent-cyan)", color: "var(--accent-cyan)", background: "var(--accent-cyan-muted)" }
      : { borderColor: "var(--border-primary)", color: "var(--text-tertiary)" };

  return (
    <div>
      {/* Benefits */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
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

      {/* Search + sort */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search devices — smart plug, water, safety…"
            className="w-full rounded-xl border py-3 pl-11 pr-4 text-sm outline-none transition-all focus:ring-2 focus:ring-[var(--accent-cyan)]/30"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)", color: "var(--text-primary)" }}
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-xl border px-4 py-3 text-sm outline-none"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)", color: "var(--text-primary)" }}
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Category + toggles */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {cats.map((c) => (
          <button key={c} onClick={() => setCat(c)} className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors" style={chip(cat === c)}>
            {c}
          </button>
        ))}
        <span className="mx-1 hidden h-5 w-px sm:block" style={{ background: "var(--border-primary)" }} />
        <button onClick={() => setInStock((v) => !v)} className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors" style={chip(inStock)}>
          In stock
        </button>
        <button
          onClick={() => setSavedOnly((v) => !v)}
          className="flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors"
          style={chip(savedOnly)}
        >
          <Heart className="h-3.5 w-3.5" style={{ fill: savedOnly ? "currentColor" : "none" }} /> Saved{count ? ` (${count})` : ""}
        </button>
        <span className="mx-1 hidden h-5 w-px sm:block" style={{ background: "var(--border-primary)" }} />
        <div className="flex items-center gap-1.5 rounded-full border px-3 py-1" style={{ borderColor: "var(--border-primary)" }}>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>₹</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))}
            placeholder={String(priceBounds.min)}
            aria-label="Minimum price"
            className="w-16 bg-transparent text-sm outline-none"
            style={{ color: "var(--text-primary)" }}
          />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>–</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))}
            placeholder={String(priceBounds.max)}
            aria-label="Maximum price"
            className="w-16 bg-transparent text-sm outline-none"
            style={{ color: "var(--text-primary)" }}
          />
        </div>
        {anyFilter && (
          <button
            onClick={resetFilters}
            className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors"
            style={{ borderColor: "var(--border-primary)", color: "var(--text-muted)" }}
          >
            Reset
          </button>
        )}
      </div>

      <p className="mb-6 text-xs" style={{ color: "var(--text-muted)" }}>
        {shown.length} product{shown.length === 1 ? "" : "s"}
      </p>

      {/* Grid */}
      {shown.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
      ) : (
        <div
          className="flex flex-col items-center gap-3 rounded-2xl border p-12 text-center"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
        >
          <PackageX className="h-8 w-8" style={{ color: "var(--text-muted)" }} />
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            {savedOnly ? "No saved products yet — tap the heart on a product to save it." : `No products match your filters.`}
          </p>
        </div>
      )}

      <RecentlyViewed limit={4} />
    </div>
  );
}
