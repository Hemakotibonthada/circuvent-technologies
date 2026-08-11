"use client";

import Link from "next/link";
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight, Truck, ShieldCheck, Wallet } from "lucide-react";
import { useCart } from "@/components/shop/CartProvider";
import { useCartQuote } from "@/hooks/useCartQuote";
import ProductMedia from "@/components/shop/ProductMedia";
import { formatINR } from "@/lib/shop-data";

export default function CartPage() {
  const { items, setQty, remove, subtotal, shipping, total, freeShipOver } = useCart();

  /*
   * Server totals win when they arrive. Bundle discounts are worked out from
   * the cart's contents on the server, so adding the lines up here would show a
   * total the checkout then undercuts with no explanation. Falls back to the
   * local figures while the quote is in flight or if it fails.
   */
  const quote = useCartQuote(items);
  const shownShipping = quote?.shipping ?? shipping;
  const shownTotal = quote?.total ?? total;
  const bundleDiscount = quote?.bundleDiscount ?? 0;
  const bundles = quote?.bundles ?? [];

  return (
    <section className="relative z-10 mx-auto max-w-5xl px-6 pb-24 pt-32 lg:px-8">
      <h1 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
        Your cart
      </h1>

      {items.length === 0 ? (
        <div
          className="mt-8 grid place-items-center gap-4 rounded-2xl border p-12 text-center"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
        >
          <ShoppingBag className="h-10 w-10" style={{ color: "var(--text-muted)" }} />
          <p style={{ color: "var(--text-tertiary)" }}>Your cart is empty.</p>
          <Link
            href="/shop"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Browse the shop <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="rounded-2xl border" style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}>
            {items.map((it) => (
              <div
                key={it.id}
                className="flex items-center gap-4 p-4"
                style={{ borderBottom: "1px solid var(--border-primary)" }}
              >
                <ProductMedia
                  image={it.image}
                  accent={it.accent}
                  icon={it.icon}
                  name={it.name}
                  className="h-16 w-16 shrink-0 rounded-xl"
                  iconClass="text-2xl"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/shop/${it.slug}`}
                    className="font-semibold hover:opacity-80"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {it.name}
                  </Link>
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    {formatINR(it.price)}
                  </p>
                </div>
                <div className="inline-flex items-center rounded-lg border" style={{ borderColor: "var(--border-primary)" }}>
                  <button
                    onClick={() => setQty(it.id, it.qty - 1)}
                    className="grid h-9 w-9 place-items-center hover:opacity-70"
                    style={{ color: "var(--text-secondary)" }}
                    aria-label="Decrease"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-8 text-center text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {it.qty}
                  </span>
                  <button
                    onClick={() => setQty(it.id, it.qty + 1)}
                    className="grid h-9 w-9 place-items-center hover:opacity-70"
                    style={{ color: "var(--text-secondary)" }}
                    aria-label="Increase"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="w-24 text-right font-semibold" style={{ color: "var(--text-primary)" }}>
                  {formatINR(it.price * it.qty)}
                </div>
                <button
                  onClick={() => remove(it.id)}
                  aria-label="Remove"
                  className="hover:opacity-70"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div
            className="h-fit rounded-2xl border p-6"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
          >
            <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
              Order summary
            </h3>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt style={{ color: "var(--text-tertiary)" }}>Subtotal</dt>
                <dd style={{ color: "var(--text-secondary)" }}>{formatINR(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt style={{ color: "var(--text-tertiary)" }}>Shipping</dt>
                <dd style={{ color: "var(--text-secondary)" }}>
                  {shownShipping === 0 ? "Free" : formatINR(shownShipping)}
                </dd>
              </div>
              {bundleDiscount > 0 && (
                <div className="flex justify-between">
                  <dt className="min-w-0" style={{ color: "var(--text-tertiary)" }}>
                    Bundle saving
                    {/* Name the bundle: an unexplained deduction reads like an
                        error, and the shopper cannot tell what they would lose
                        by removing an item. */}
                    {bundles.length > 0 && (
                      <span className="block truncate text-xs" style={{ color: "var(--text-muted)" }}>
                        {bundles.map((b) => (b.times > 1 ? `${b.name} ×${b.times}` : b.name)).join(", ")}
                      </span>
                    )}
                  </dt>
                  <dd className="shrink-0 font-semibold text-emerald-500">− {formatINR(bundleDiscount)}</dd>
                </div>
              )}
              <div
                className="mt-2 flex justify-between pt-3 text-base"
                style={{ borderTop: "1px solid var(--border-primary)" }}
              >
                <dt className="font-semibold" style={{ color: "var(--text-primary)" }}>
                  Total
                </dt>
                <dd className="font-extrabold" style={{ color: "var(--text-primary)" }}>
                  {formatINR(shownTotal)}
                </dd>
              </div>
            </dl>
            {subtotal > 0 && subtotal < freeShipOver && (
              <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                Add{" "}
                <span className="font-semibold" style={{ color: "var(--accent-cyan)" }}>
                  {formatINR(freeShipOver - subtotal)}
                </span>{" "}
                more for free shipping.
              </p>
            )}
            <Link
              href="/checkout"
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition-transform hover:scale-[1.02]"
            >
              Checkout <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/shop"
              className="mt-2 block w-full rounded-xl border px-5 py-2.5 text-center text-sm font-medium"
              style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
            >
              Continue shopping
            </Link>
            <div className="mt-4 flex items-center justify-center gap-4 text-[11px]" style={{ color: "var(--text-muted)" }}>
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> Warranty
              </span>
              <span className="flex items-center gap-1">
                <Wallet className="h-3 w-3" /> COD
              </span>
              <span className="flex items-center gap-1">
                <Truck className="h-3 w-3" /> Fast ship
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
