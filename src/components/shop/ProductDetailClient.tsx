"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Check, Minus, Plus, ShoppingCart, Zap, ShieldCheck, Star } from "lucide-react";
import { type Product, formatINR } from "@/lib/shop-data";
import { useCart } from "./CartProvider";
import ProductMedia from "./ProductMedia";

export default function ProductDetailClient({
  product,
  related,
}: {
  product: Product;
  related: Product[];
}) {
  const { add } = useCart();
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const saving = product.compareAt && product.compareAt > product.price ? product.compareAt - product.price : 0;

  const buyNow = () => {
    add(product, qty, { silent: true });
    router.push("/checkout");
  };

  return (
    <section className="relative z-10 mx-auto max-w-7xl px-6 pb-24 pt-8 lg:px-8">
      <Link
        href="/shop"
        className="mb-6 inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
        style={{ color: "var(--text-tertiary)" }}
      >
        <ArrowLeft className="h-4 w-4" /> Shop
      </Link>

      <div className="grid gap-10 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
          <ProductMedia
            image={product.image}
            accent={product.accent}
            icon={product.icon}
            name={product.name}
            className="h-[360px] w-full rounded-3xl border sm:h-[460px]"
            iconClass="text-[120px]"
          />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
          <div className="flex items-center gap-3">
            <span
              className="rounded-full px-3 py-1 text-xs font-medium"
              style={{ background: `${product.accent}1f`, color: product.accent }}
            >
              {product.category}
            </span>
            <span className="flex items-center gap-1 text-sm" style={{ color: "var(--text-tertiary)" }}>
              <Star className="h-3.5 w-3.5 fill-current" style={{ color: "#f59e0b" }} /> {product.rating}
            </span>
          </div>

          <h1 className="mt-4 text-3xl font-bold sm:text-4xl" style={{ color: "var(--text-primary)" }}>
            {product.name}
          </h1>
          <p className="mt-2 text-lg" style={{ color: product.accent }}>
            {product.tagline}
          </p>

          <div className="mt-4 flex flex-wrap items-baseline gap-3">
            <span className="text-3xl font-extrabold" style={{ color: "var(--text-primary)" }}>
              {formatINR(product.price)}
            </span>
            {saving > 0 && (
              <>
                <span className="text-lg line-through" style={{ color: "var(--text-muted)" }}>
                  {formatINR(product.compareAt!)}
                </span>
                <span className="text-sm font-semibold text-emerald-500">Save {formatINR(saving)}</span>
              </>
            )}
          </div>

          <p className="mt-4 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            {product.description}
          </p>

          <ul className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {product.specs.map((s) => (
              <li key={s} className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                <Check className="h-4 w-4 shrink-0" style={{ color: product.accent }} /> {s}
              </li>
            ))}
          </ul>

          <div className="mt-6 flex items-center gap-3">
            <div className="inline-flex items-center rounded-xl border" style={{ borderColor: "var(--border-primary)" }}>
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="grid h-11 w-11 place-items-center hover:opacity-70"
                style={{ color: "var(--text-secondary)" }}
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center font-semibold" style={{ color: "var(--text-primary)" }}>
                {qty}
              </span>
              <button
                onClick={() => setQty((q) => Math.min(99, q + 1))}
                className="grid h-11 w-11 place-items-center hover:opacity-70"
                style={{ color: "var(--text-secondary)" }}
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {product.stock > 0 ? `${product.stock} in stock` : "Made to order"}
            </span>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={() => add(product, qty)}
              className="inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold transition-colors"
              style={{ borderColor: "var(--border-hover)", color: "var(--text-primary)", background: "var(--bg-surface)" }}
            >
              <ShoppingCart className="h-4 w-4" /> Add to cart
            </button>
            <button
              onClick={buyNow}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition-transform hover:scale-[1.02]"
            >
              <Zap className="h-4 w-4" /> Buy now
            </button>
          </div>

          <p className="mt-6 flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
            <ShieldCheck className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> 6-month warranty · Cash on
            delivery · Ships across India
          </p>
        </motion.div>
      </div>

      {related.length > 0 && (
        <div className="mt-16">
          <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            You may also like
          </h2>
          <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => (
              <Link
                key={r.id}
                href={`/shop/${r.slug}`}
                className="group flex items-center gap-4 rounded-2xl border p-5 transition-all hover:-translate-y-1"
                style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)", boxShadow: "var(--shadow-sm)" }}
              >
                <ProductMedia
                  image={r.image}
                  accent={r.accent}
                  icon={r.icon}
                  name={r.name}
                  className="h-14 w-14 shrink-0 rounded-xl"
                  iconClass="text-2xl"
                />
                <div className="min-w-0">
                  <p className="truncate font-semibold" style={{ color: "var(--text-primary)" }}>
                    {r.name}
                  </p>
                  <p className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                    {r.tagline}
                  </p>
                  <p className="mt-1 text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                    {formatINR(r.price)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
