"use client";

import { useState } from "react";
import Link from "next/link";import { ArrowRight, Check, Heart, Minus, Plus, ShoppingCart, Truck, ShieldCheck } from "lucide-react";
import { formatINR, SHIPPING, type Product } from "@/lib/shop-data";
import { discountPct, isLowStock, isSoldOut, savingOf } from "@/lib/shop-filters";
import { useCart } from "./CartProvider";
import { useWishlist } from "./WishlistProvider";
import { useToast } from "./ToastProvider";
import ShopDialog from "./ShopDialog";
import ProductMedia from "./ProductMedia";
import Stars from "./Stars";

/**
 * Quick view — lets shoppers evaluate and buy a product without losing their
 * place in the (possibly heavily filtered) grid.
 */
export default function QuickViewModal({
  product,
  open,
  onClose,
}: {
  product: Product | null;
  open: boolean;
  onClose: () => void;
}) {
  const { add } = useCart();
  const { has, toggle } = useWishlist();
  const { toast } = useToast();
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [shownProductId, setShownProductId] = useState(product?.id);

  // Reset per-product state so a previous product's quantity never carries over.
  // Adjusting during render (rather than in an effect) avoids a flash of the
  // stale quantity on the first paint of the new product.
  if (product?.id !== shownProductId) {
    setShownProductId(product?.id);
    setQty(1);
    setActiveImage(0);
  }

  if (!product) return null;

  const gallery = [product.image, ...(product.images ?? [])].filter(
    (src): src is string => typeof src === "string" && src.length > 0
  );
  const uniqueGallery = Array.from(new Set(gallery));
  const soldOut = isSoldOut(product);
  const saving = savingOf(product);
  const discount = discountPct(product);
  const lowStock = isLowStock(product);
  const saved = has(product.id);
  const freeShipping = product.price * qty >= SHIPPING.freeOver;

  const handleAdd = () => {
    add(product, qty, { silent: true });
    toast({
      title: `${product.name} added to cart`,
      description: `${qty} × ${formatINR(product.price)}`,
      action: { label: "View cart", href: "/cart" },
    });
    onClose();
  };

  return (
    <ShopDialog open={open} onClose={onClose} title={product.name} description={product.tagline}>
      <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-2">
        {/* Gallery */}
        <div>
          <ProductMedia
            image={uniqueGallery[activeImage]}
            accent={product.accent}
            icon={product.icon}
            name={product.name}
            className="aspect-square w-full rounded-2xl"
          />
          {uniqueGallery.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
              {uniqueGallery.map((src, i) => (
                <button
                  key={src}
                  onClick={() => setActiveImage(i)}
                  aria-label={`View image ${i + 1} of ${uniqueGallery.length}`}
                  aria-current={i === activeImage}
                  className="shrink-0 overflow-hidden rounded-xl border-2 transition-colors"
                  style={{ borderColor: i === activeImage ? "var(--accent-cyan)" : "var(--border-primary)" }}
                >
                  <ProductMedia
                    image={src}
                    accent={product.accent}
                    icon={product.icon}
                    name=""
                    className="h-14 w-14"
                    iconClass="text-xl"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ background: "var(--accent-cyan-muted)", color: "var(--accent-cyan)" }}
            >
              {product.category}
            </span>
            {product.badge && !soldOut && (
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-white"
                style={{ background: "var(--accent-violet)" }}
              >
                {product.badge}
              </span>
            )}
            <Stars rating={product.rating} reviewCount={product.reviewCount} />
          </div>

          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            {product.description}
          </p>

          <div className="mt-4 flex flex-wrap items-baseline gap-2">
            <span className="text-3xl font-extrabold" style={{ color: "var(--text-primary)" }}>
              {formatINR(product.price)}
            </span>
            {saving > 0 && (
              <>
                <span className="text-base line-through" style={{ color: "var(--text-muted)" }}>
                  {formatINR(product.compareAt!)}
                </span>
                <span className="text-sm font-bold" style={{ color: "#10b981" }}>
                  {discount}% off
                </span>
              </>
            )}
          </div>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Inclusive of all taxes
          </p>

          <ul className="mt-4 grid gap-1.5">
            {product.specs.slice(0, 5).map((s) => (
              <li key={s} className="flex items-start gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--accent-cyan)" }} /> {s}
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap gap-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
            <span className="inline-flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5" style={{ color: "var(--accent-cyan)" }} />
              {freeShipping ? "Free shipping" : `${formatINR(SHIPPING.flat)} shipping`}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" style={{ color: "var(--accent-cyan)" }} /> 6-month warranty
            </span>
          </div>

          {soldOut ? (
            <p className="mt-4 rounded-xl border px-3 py-2 text-xs font-medium" style={{ borderColor: "var(--border-primary)", color: "#f59e0b" }}>
              Currently out of stock — open the product page to get a restock alert.
            </p>
          ) : (
            lowStock && (
              <p className="mt-4 text-xs font-semibold" style={{ color: "#f59e0b" }}>
                Hurry — only {product.stock} left in stock
              </p>
            )
          )}

          <div className="mt-auto pt-5">
            <div className="flex items-center gap-3">
              <div
                className="inline-flex items-center rounded-xl border"
                style={{ borderColor: "var(--border-primary)" }}
              >
                <button
                  onClick={() => setQty((v) => Math.max(1, v - 1))}
                  disabled={qty <= 1}
                  aria-label="Decrease quantity"
                  className="grid h-10 w-10 place-items-center transition-opacity hover:opacity-70 disabled:opacity-30"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span
                  aria-live="polite"
                  className="w-8 text-center text-sm font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {qty}
                </span>
                <button
                  onClick={() => setQty((v) => Math.min(99, v + 1))}
                  aria-label="Increase quantity"
                  className="grid h-10 w-10 place-items-center transition-opacity hover:opacity-70"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <button
                onClick={() => {
                  const nowSaved = !saved;
                  toggle(product.id);
                  toast({
                    title: nowSaved ? "Saved to wishlist" : "Removed from wishlist",
                    description: product.name,
                    tone: "info",
                    duration: 2500,
                  });
                }}
                aria-pressed={saved}
                className="grid h-10 w-10 place-items-center rounded-xl border transition-colors"
                style={{ borderColor: "var(--border-primary)" }}
              >
                <Heart
                  className="h-4 w-4"
                  style={{ color: saved ? "#ef4444" : "var(--text-tertiary)", fill: saved ? "#ef4444" : "none" }}
                />
                <span className="sr-only">{saved ? "Remove from wishlist" : "Save to wishlist"}</span>
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                onClick={handleAdd}
                disabled={soldOut}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
              >
                <ShoppingCart className="h-4 w-4" /> {soldOut ? "Out of stock" : "Add to cart"}
              </button>
              <Link
                href={`/shop/${product.slug}`}
                onClick={onClose}
                className="flex items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold transition-colors"
                style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
              >
                Full details <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </ShopDialog>
  );
}
