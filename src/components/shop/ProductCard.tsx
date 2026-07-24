"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Check, ShoppingCart, ArrowRight, Star, Heart } from "lucide-react";
import { type Product, formatINR } from "@/lib/shop-data";
import { useCart } from "./CartProvider";
import { useWishlist } from "./WishlistProvider";
import ProductMedia from "./ProductMedia";

export default function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const { add } = useCart();
  const { has, toggle } = useWishlist();
  const saved = has(product.id);
  const saving = product.compareAt && product.compareAt > product.price ? product.compareAt - product.price : 0;
  const discount = saving > 0 && product.compareAt ? Math.round((saving / product.compareAt) * 100) : 0;
  const soldOut = product.available === false || (typeof product.stock === "number" && product.stock <= 0);
  const lowStock = !soldOut && typeof product.stock === "number" && product.stock <= 5;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.35, delay: (index % 3) * 0.05 }}
      whileHover={{ y: -4 }}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border transition-all duration-300"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)", boxShadow: "var(--shadow-sm)" }}
    >
      <button
        onClick={(e) => {
          e.preventDefault();
          toggle(product.id);
        }}
        aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
        className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full backdrop-blur transition-transform hover:scale-110"
        style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}
      >
        <Heart className="h-4 w-4" style={{ color: saved ? "#ef4444" : "var(--text-tertiary)", fill: saved ? "#ef4444" : "none" }} />
      </button>

      <Link href={`/shop/${product.slug}`} className="relative block">
        <ProductMedia
          image={product.image}
          accent={product.accent}
          icon={product.icon}
          name={product.name}
          className="h-44 w-full"
        />
        {discount > 0 && (
          <span className="absolute left-3 top-3 rounded-full bg-gradient-to-r from-rose-500 to-orange-500 px-2.5 py-1 text-xs font-bold text-white shadow">
            {discount}% OFF
          </span>
        )}
        {product.badge && !soldOut && (
          <span className="absolute right-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold text-white shadow" style={{ background: "var(--accent-violet, #8b5cf6)" }}>
            {product.badge}
          </span>
        )}
        {saving > 0 && (
          <span className="absolute bottom-3 left-3 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 px-2.5 py-1 text-xs font-semibold text-white shadow">
            Save {formatINR(saving)}
          </span>
        )}
        {soldOut && (
          <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-white shadow">
            Out of stock
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {product.category}
          </span>
          <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
            <Star className="h-3 w-3 fill-current" style={{ color: "#f59e0b" }} /> {product.rating}
            {product.reviewCount ? ` (${product.reviewCount})` : ""}
          </span>
        </div>

        <Link href={`/shop/${product.slug}`}>
          <h3 className="mt-1 text-lg font-bold transition-opacity group-hover:opacity-80" style={{ color: "var(--text-primary)" }}>
            {product.name}
          </h3>
        </Link>
        <p className="mt-1 text-sm" style={{ color: "var(--text-tertiary)" }}>
          {product.tagline}
        </p>

        <ul className="mt-3 space-y-1">
          {product.specs.slice(0, 3).map((s) => (
            <li key={s} className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              <Check className="h-3 w-3 shrink-0" style={{ color: "var(--accent-cyan)" }} /> {s}
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-4">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold" style={{ color: "var(--text-primary)" }}>
              {formatINR(product.price)}
            </span>
            {saving > 0 && (
              <span className="text-sm line-through" style={{ color: "var(--text-muted)" }}>
                {formatINR(product.compareAt!)}
              </span>
            )}
            {discount > 0 && (
              <span className="text-sm font-semibold" style={{ color: "#10b981" }}>
                {discount}% off
              </span>
            )}
          </div>
          {lowStock && (
            <p className="mt-1 text-xs font-medium" style={{ color: "#f59e0b" }}>
              Only {product.stock} left
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => !soldOut && add(product)}
              disabled={soldOut}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
            >
              <ShoppingCart className="h-4 w-4" /> {soldOut ? "Out of stock" : "Add to cart"}
            </button>
            <Link
              href={`/shop/${product.slug}`}
              aria-label="View details"
              className="grid place-items-center rounded-xl border px-3 transition-colors"
              style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
            >
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
